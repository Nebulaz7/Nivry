# Authority-path review (Day 4)

A method-by-method audit of who may call what, what state it requires, and what it
mutates. This is the artifact to read before trusting the contracts; it is a
**code review, not a security audit**, and nothing here has run on a live network.

Legend for **Auth**: `owner` = `predecessor_account_id()` must equal the current
NEP-171 title holder; `executor` = predecessor must equal the installed executor
and its epoch; `private` = near-sdk `#[private]`, so only this contract can call it;
`anyone` = intentionally unauthenticated.

## Registry

| Method | Auth | Required state | Mutates | Primary failure mode |
| --- | --- | --- | --- | --- |
| `new` | `#[init]` | not initialized | owner, code hash | — |
| `create_agent` | payer | valid manifest, exact deposit | `next_token_id`, agent (`provisioning`), reverse binding | batch never confirms → `uncertain` |
| `on_create_agent` | private | `provisioning` | mint, lifecycle | lost callback → `uncertain` |
| `set_executor` | owner | ready, idle, not listed, not frozen, epoch match | epoch↑, grant, executor map | stale epoch rejected |
| `revoke_executor` | owner | ready, idle, not listed, epoch match, grant exists | epoch↑, grant cleared, map cleared | — |
| `set_frozen` | owner | ready, epoch match | listing cancelled, grant cleared, epoch↑, `frozen` | allowed while a command is pending |
| `execute_payment` | executor | ready, idle, not listed, not frozen, owner+epoch+nonce+deadline+allowlist+cap+budget | nonce↑, budget spent, pending op | wallet rejection → resolved by status proof |
| `owner_withdraw` | owner | ready, idle, not listed, not frozen, epoch+nonce | nonce↑, pending op | same |
| `on_dispatch_settled` | private | matching pending op | pending cleared, budget restored | unreadable → asks treasury |
| `on_dispatch_status` | private | matching pending op | pending cleared, budget restored | no proof → stays locked |
| `reconcile_operation` | anyone | matching pending op | none (fires a query) | ignored if nothing pending |
| `list_agent` | owner | ready, idle, not listed, not frozen, epoch match, exact deposit, price > 0 | listing, `next_listing_id` | — |
| `cancel_listing` | owner | listing id match | listing removed | — |
| `buy_agent` | payer | ready, idle, listing id + epoch + manifest + seller-is-owner + exact price | title, epoch↑, grant cleared, listing cleared, seller credit | seller == buyer rejected |
| `withdraw_sale_proceeds` | seller | no unresolved withdrawal, amount ≤ available | credit reserved, pending withdrawal | callback lost → stays reserved |
| `on_sale_withdrawal_settled` | private | operation match | credit released or returned | — |
| `reconcile_provisioning` | anyone | lifecycle `uncertain`, not minted | none (fires a query) | — |
| `on_provisioning_status` | private | lifecycle `uncertain`, not minted | mint, lifecycle → ready | binding unproven → unchanged |
| `nft_transfer` | NEP-171 owner/approved | ready, idle, not listed, 1 yocto | title, epoch↑, grant cleared, count↑, `frozen=false` | listed token rejected |
| `nft_transfer_call` | NEP-171 owner/approved | ready, idle, not listed, 1 yocto, ≥ 60 TGas | provisional title, epoch↑, grant cleared, transfer-call lock | receiver silent → stays locked |
| `on_transfer_call_resolved` | private | operation match | accept, or return + restore approvals | missing result → stays locked |
| views | anyone | `agent_info` needs no title | none | — |

## Treasury (`agent-wallet`)

| Method | Auth | Required state | Mutates | Notes |
| --- | --- | --- | --- | --- |
| `new` | `#[init]` | not initialized | registry + token binding | no public reinitializer |
| `pay_agent` | anyone | positive deposit | payment count/amount | epoch argument is *observed*, never trusted |
| `deposit` | anyone | positive deposit | nothing | explicitly not revenue |
| `dispatch_native` | registry only | not pending, sequence == next, amount > 0, balance ≥ reserve + amount | sequence↑, operation record, pending | fixed recipient/amount, no caller-chosen action |
| `finalize_dispatch` | private | one promise result, op match | operation status, pending | returns the outcome to the registry |
| views | anyone | — | — | — |

## Invariants and where they are enforced

| Invariant | Enforcement |
| --- | --- |
| The title is the **only** source of ownership | `current_owner` reads `owner_by_id`; no cached owner field exists |
| Every title movement advances authority and drops the grant | `nft_transfer`, `nft_transfer_call`, `buy_agent` all bump epoch and clear the grant in the same receipt |
| Nonces only move forward | `next_command_nonce`, `next_listing_id`, wallet `next_sequence`; none are reset |
| At most one unresolved treasury command per token | `pending_operation` set before any promise is scheduled |
| At most one unresolved transfer call per token | `pending_transfer_call`, cleared only by the matching private resolver |
| Money leaves a treasury only through its bound registry | wallet `dispatch_native` compares `predecessor` to an immutable field |
| No key can ever exist on a treasury | creation batch has no `AddKey`; code exposes no key/upgrade/delete path |
| Seller credits never draw on treasury funds | credits live in registry state; `credit_seller` only runs on the price the registry received |
| A request cannot replay across epochs | expected-epoch arguments plus a generation that only increases |

## Findings

**Fixed in this pass**

1. **`agent_info` reverted for a provisioning token.** It required a minted title,
   so the Create screen could never render an in-progress agent. `owner_id` is now
   `Option<AccountId>`. *This is a view-shape change; clients must handle `null`.*
2. **`nft_transfer_call` had no gas floor.** A caller could attach too little for
   the resolver, leaving the agent locked with no outcome and no retry. Added
   `MIN_TRANSFER_CALL_GAS` (60 TGas).
3. **`buy_agent` relied on a misleading panic.** If the listed seller wasn't the
   owner, `internal_transfer` failed with "sender not approved". Now an explicit
   `the listed seller is no longer the token owner` check runs first.

**Accepted, and documented as limitations**

4. The listing deposit is not refunded on `cancel_listing`.
5. Registry solvency is not enforced on-chain (`total_seller_credits` vs
   `registry_balance` is a view, not a guard).
6. No `nft_approve`, so approvals can be restored but never created.
7. `set_frozen` is permitted while a transfer call is unresolved; the transfer-call
   lock is a separate mechanism and still resolves normally.
8. `set_executor` accepts the registry or the owner as executor. Harmless: executor
   authority gates only `execute_payment`, which the registry never calls.
9. `nft_transfer` is allowed while frozen. Freeze stops *spending*, not the owner's
   ability to hand over the title.

## How to re-run

```sh
# Windows
bash scripts/with-rust-toolchain.sh bash scripts/test-contracts.sh
# WSL / Linux
bash scripts/test-contracts.sh
```

Current count: **60 tests** (12 treasury, 48 registry).
