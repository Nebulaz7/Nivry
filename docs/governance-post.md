# [Proposal] Agent Title Extension for NEP-171 — NFTs as title to a keyless agent treasury

> Draft governance post. Canonical discussion belongs in `near/NEPs` (NEP-1
> process), not gov.near.org; gov.near.org can mirror it for visibility.
>
> **Blocker before posting:** `https://github.com/Nebulaz7/Nivry` currently
> returns 404, i.e. the repository is still private. Make it public first, or the
> only thing reviewers can check is a dead link.

## TL;DR

I'd like to propose a new standard that sits alongside NEP-171, the same way
NEP-177 and NEP-178 do. A NEP-171 token becomes the **title** to an agent
account: whoever owns the token controls the account, and a sale hands control
over safely — including the awkward cases: pending payouts, `nft_transfer_call`
rollbacks, and a buyer inspecting a state that then changes underneath them.

It is live on testnet now: `nivry.testnet`, agent token `1`, treasury
`00000001.nivry.testnet`. The treasury has **no access keys**. Reference
implementation at [`Nebulaz7/Nivry`](https://github.com/Nebulaz7/Nivry) (commit
[`b083020`](https://github.com/Nebulaz7/Nivry/commit/b083020013b0c7343da0a14249f420a5841c9083)).
I'd like feedback on the design before opening a draft NEP PR.

## Problem

Agents hold funds and act. If an NFT represents one, a sale has to guarantee three
things:

1. after the sale, only the new owner can move value held by the agent,
2. nothing the seller started before the sale completes under the buyer, and
3. the buyer gets the state they inspected.

NEP-171 gives ownership. NEP-177 gives display metadata. NEP-178 gives approvals.
None of them define any of the above. Today every project invents its own scheme,
marketplaces cannot compare agents, and there is no shared call that answers "who
controls this agent right now?".

Concretely, without this: a seller lists an agent, the buyer verifies the treasury
balance, and between verification and purchase the seller withdraws. Or the seller
leaves an approved marketplace account that can still move the title. Or
`nft_transfer_call` resolves as a rollback while a custodian still holds a cached,
now-stale authorization.

## The mechanism

Two monotonic counters and one flag, per token.

| Field | Meaning |
| --- | --- |
| `authority_epoch: u64` | Monotonic **authority generation**. Increases on owner change (including a `nft_transfer_call` rollback), on executor grant install/revoke, and on freeze change. Grants and in-flight commands carry it, and a stale epoch is rejected. Never decreases, so A → B → A does not revive A's old grant. |
| `version: u64` | Buyer-visible state version. Increases on owner change, freeze change, grant change, every scheduled outflow, and delisting. Deliberately **does not** increase on incoming payments, so nobody can grief a purchase by sending dust. |
| `frozen: bool` | A single "stop / for sale" lock. Blocks every outflow; never blocks inflows. Owner-only, exactly 1 yoctoNEAR, requires `expected_version`, and is publicly readable. |

### Reading the names

The names are the ones actually deployed, and they are load-bearing enough that
I want to justify them rather than leave them to taste.

**`authority_epoch` — not `owner_epoch`.** It is not only an owner counter. A
grant is invalidated when the owner changes, but also when the owner replaces or
revokes that grant, and when the owner freezes the agent. All three are "the
authority this grant was issued under is gone", so the counter belongs to
*authority*, not to ownership. The other half — "epoch" — is a generation
number, not a timestamp and not NEAR's blockchain epoch; I am aware that is a
collision with chain vocabulary, and if reviewers think it reads as time
progression I would rename it `authority_generation` rather than `owner_epoch`.

**`version` — kept separate from the epoch on purpose.** Both move on an
ownership change, but they answer different questions. `authority_epoch` answers
"is this grant still valid?", so it must move on anything that could invalidate
authority. `version` answers "is what the buyer inspected still true?", so it
must *also* move on outflows, which should invalidate nothing. Merging them would
make every routine payout look like a hostile ownership change and force the
owner to re-issue the grant after every payment.

**`version` ignores incoming payments deliberately.** Anyone can send NEAR to the
treasury. If inflow bumped `version`, anyone could send a dust payment at any
moment and cause every in-flight purchase to abort — a cheap denial-of-service
against the market. Inflow events still exist, they just do not participate in
the version.

**`frozen` — not `locked`, `paused` or `for_sale`.** One flag, one meaning: no
value leaves. It is deliberately not a status enum, because "paused" and "for
sale" are not different enforcement states — both must block outflows, and both
must be visible to a buyer. Listing is not a second lock, it is a *use* of the
lock: `list_agent` refuses unless `frozen` is already true. That keeps one rule
to reason about and one rule to test.

**`treasury_account_id` — not `agent_account`.** The bound account is not a
general-purpose agent account. It holds no keys, cannot be upgraded, and has a
non-spendable storage plus operating reserve, so its balance is never fully
withdrawable. "Treasury" describes what a buyer is actually acquiring: a pot of
value with a fixed spending policy. Calling it an "agent account" would imply the
token carries the agent's runtime, which it does not (see limitations).

**`executor_grant` — not `operator` or `delegate`.** A grant is a *bounded*,
expiring capability: one executor, 1–8 allowed recipients, a per-payment cap, a
total budget and a maximum 90-day lifetime. "Operator" suggests standing
authority; this is closer to a prepaid allowance.

**`ownership_change_count` is separate from both counters.** `version` moves for
many reasons that are not sales; a passport wants "how many times did this agent
change hands". Keeping them apart means neither has to be reinterpreted.

**Keyless treasury.** `create_agent` builds the treasury in one receipt — create
account, transfer, deploy, init — with **no key actions at all**. There is no
`add_access_key`, no upgrade method, no delete, and no rebind (`new` is
`#[init]`). The treasury never caches an owner and never accepts commands from an
owner or an executor: `dispatch_native` is callable only by the immutable
registry, permits one unresolved command at a time, requires a monotonic
sequence, and refuses any amount that would eat into storage plus a 0.1 NEAR
operating reserve.

**Settlement fails closed.** The registry records the pending operation and the
`version` at dispatch *before* scheduling anything, and rejects `set_frozen` while
an operation is unresolved — so `version` cannot move in flight. If the treasury's
callback is unreadable, the registry queries the treasury's own persisted
`operation_status`: `null` proves nothing was ever dispatched, a terminal status
settles, and anything else leaves the token locked rather than guessing. It never
retries and never refunds on uncertainty, because "transfer succeeded, then
finalization failed" is indistinguishable from failure to a naive caller.

**Listing and purchase.**

- `set_frozen(true)` also clears the executor grant and bumps `authority_epoch`.
  Freezing can be undone, but a frozen agent has no working operator.
- `list_agent(token_id, expected_version, price)` refuses unless the agent is
  already frozen, and captures the `version` and `manifest_hash` at listing time.
- `buy_agent(token_id, listing_id, expected_version, expected_manifest_hash)`
  aborts atomically if the agent's `version`, the listed `version`, the manifest
  hash, or the lock state has changed. Title transfer, grant removal, epoch and
  version bumps, listing consumption and seller credit all happen in one receipt,
  so there is no window where the buyer owns the token but the seller is unpaid.
- `cancel_listing` clears both the listing and the lock, so a failed sale cannot
  trap the agent.

## Method surface

| Method | Notes |
| --- | --- |
| `create_agent(manifest, expected_cost) -> String` | payable, exact published cost, no key actions |
| `set_executor(token_id, expected_epoch, grant)` / `revoke_executor(token_id, expected_epoch)` | one executor per agent, 1–8 recipient allowlist, per-payment cap, total budget, ≤90-day lifetime |
| `execute_payment(token_id, expected_owner, authority_epoch, nonce, recipient, amount, deadline_ns)` | authenticated by the predecessor, not by a supplied owner string |
| `owner_withdraw(token_id, expected_epoch, nonce, recipient, amount)` | same dispatch path, no grant required |
| `set_frozen(token_id, expected_version, frozen)` | owner-only, exactly 1 yoctoNEAR |
| `list_agent` / `cancel_listing` / `buy_agent` | inline market, see above |
| `agent_info(token_id) -> AgentInfo` | `owner_id`, `authority_epoch`, `version`, `frozen`, `treasury_account_id`, grant, pending operation, listing, manifest |
| `wallet_code_hash()`, `provisioning_cost()`, `treasury_account_id(token_id)`, `listing_deposit()`, `seller_credit(account_id)` | everything a client needs to verify or price a call |

Mutating methods authenticate the **predecessor**, so an approved marketplace
account can move the title and nothing else — it cannot spend, grant, freeze or
list. `nft_transfer`, `nft_transfer_call` and `set_frozen` additionally require
exactly 1 yoctoNEAR.

Events are NEP-297-shaped (`standard: "nivry"`, `version: "1.0.0"`):
`agent_reserved`, `agent_ready`, `executor_authorized`, `executor_revoked`,
`freeze_changed`, `ownership_changed`, `dispatch_scheduled`, `dispatch_settled`,
`dispatch_uncertain`, `agent_listed`, `agent_sold`, `transfer_call_started`,
`transfer_call_returned`, alongside the standard `nft_mint` / `nft_transfer`.

## Live on testnet

| | |
| --- | --- |
| Source | [`Nebulaz7/Nivry`](https://github.com/Nebulaz7/Nivry) @ `b083020` |
| Registry | [`nivry.testnet`](https://explorer.testnet.near.org/accounts/nivry.testnet) — code `ee320975…`, 984,505 B |
| Treasury | [`00000001.nivry.testnet`](https://explorer.testnet.near.org/accounts/00000001.nivry.testnet) — code `ce3b675e…`, 274,121 B |
| `wallet_code_hash()` | `ce3b675e2b3d9ab5a11d8840f0e1cd48471438f6a418ddc3bafce21fca4d8e5e` |
| Explorer contract checksum | matches `wallet_code_hash()` |
| Treasury access keys | **none** — "Account is locked (no access keys)" |
| `provisioning_cost()` | 3.03 NEAR (3 NEAR code stake + registry storage) |

Transactions: [deploy + init](https://explorer.testnet.near.org/transactions/AhPAc9yuGQmHDCFPVRPikseb1k1qgzbRP9ghq3N6BQ5a) ·
[create_agent → token 1](https://explorer.testnet.near.org/transactions/J6Qd2jmNT4osYzDQq2uvZ2x3EFv4pB4EF5YRq1dW7bns)

Deployment notes, including the exact commands and what this deployment does
*not* prove, are in
[`docs/deployment.md`](https://github.com/Nebulaz7/Nivry/blob/main/docs/deployment.md).

## What this does not do

It does not transfer the agent's brain, memory or prompts, and it cannot un-copy
them — revocation removes access to the wallet, title and history, not to a copy
of the code. It cannot revoke keys that live outside the treasury. Enforcement
covers only value that passes through that account, and only if the off-chain
runtime actually reads the on-chain state. A frozen agent can still *receive*
deposits, so a buyer must read treasury state at purchase time, not a listing
snapshot. `recorded_payment_amount` is a self-reported receipt, not proof of
organic revenue — the payer appears in the event so indexers can discount
self-payments. And the deployed contract is **not immutable**: the registry still
holds a full-access key, so the code can be replaced.

## Prior art

ERC-6551 (Final) gives a token an account. This does something different: the
token is the *title* to an account it does not hold keys for, and the standard
covers the control-transfer guarantees rather than account creation. ERC-8004
(Draft) clears the agent wallet on transfer — the same intuition with different
enforcement. ERC-7857 (Final) moves encrypted agent metadata with the token;
that is a privacy problem, genuinely out of scope here, and I do not want this
standard to imply a privacy guarantee it cannot keep.

On NEAR itself, NEP-171, NEP-177, NEP-178 and NEP-297 are the pieces this builds
on, and the 177/178 extension pattern is the model for the shape. I searched
`near/NEPs` and could not find an accepted agent-ownership or agent-title NEP —
but that was a lexical search of the repo and discussions, not an exhaustive
review. If there is prior work on agent registries, token-bound identity or
staking-derived identity on NEAR that I should align with, please point me at it.
I would rather adopt existing terminology than invent a parallel one.

## Questions for reviewers

1. **Should the executor grant survive a sale?** This draft always clears it.
   The alternative is to keep an executor when the treasury is a contract that
   obeys the title — convenient, but it means a buyer inherits an operator they
   did not choose. I chose the conservative default and I am not certain it is
   right.
2. **Is one `frozen` flag enough,** or should pause and for-sale be separate
   states? One flag is simple, but it also means an agent cannot be "listed but
   still operating".
3. **Should the binding be one account or one account per owner epoch?** A
   single immutable treasury is what makes the history continuous and auditable;
   a fresh account per sale would make each buyer start clean but destroy the
   "buy the track record" proposition.
4. **Is Standards Track / Contract the right category** for a standard that
   `Requires: 171, 297`, and who should review it?

## Status

- Implemented and deployed on testnet, unaudited.
- Unit tests cover the transfer rules, freezing, grants, settlement proofs,
  listing/purchase and the `nft_transfer_call` return path. A sandbox test runs
  the full cross-contract flow against a real node.
- Reference implementation: [`Nebulaz7/Nivry`](https://github.com/Nebulaz7/Nivry),
  commit [`b083020`](https://github.com/Nebulaz7/Nivry/commit/b083020013b0c7343da0a14249f420a5841c9083).
- Next step once the design settles: a draft NEP PR in `near/NEPs` following
  NEP-1.

Thanks for reading. I am most interested in being told where this is wrong.
