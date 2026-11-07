# Nivry contracts — Day 1–2

Status: **skeleton, not deployed, not audited.** Nothing here has been run against
a network. It compiles to wasm and has unit tests; the sandbox cross-contract flow
is still a gate (see "Not done yet").

Scope for Day 1 (PLAN.md §19): minimal registry + keyless child factory,
mint/funding/transfer skeleton, typed contract arguments, and the fixed manifest.

Scope for Day 2: executor grants, monotonic epochs/nonces, the native command
sequence, pending locks, payout callbacks and reserves, and basic NFT transfer —
plus the registry-level tests that prove those properties.

## Layout

```
contracts/
  Cargo.toml            # workspace: registry + agent-wallet
  agent-wallet/         # the tiny, immutable, keyless treasury
  registry/             # NFT title + factory + authority epochs + bounded payments
    res/agent_wallet.wasm # pinned treasury artifact embedded by the factory
  integration-tests/    # own workspace root; sandbox harness (not wired yet)
```

The treasury is built and copied into `registry/res/` **before** the registry
builds, because the factory embeds those bytes with `include_bytes!`.

## Toolchain

Tested:

| Environment | rustc | Notes |
| --- | --- | --- |
| Windows 10, `x86_64-pc-windows-gnu` | 1.99.0 | Produces the wasm artifacts |
| WSL2 Ubuntu 24.04 | 1.98.0 | Host-side unit tests |

`near-sdk` 5.30.1 requires rustc ≥ 1.95; the workspace declares
`rust-version = "1.95"` rather than pinning an exact channel, because this repo is
built from two hosts and an exact pin forces a download on whichever host lacks it.

### Windows: host builds need a linker

The gnu toolchain ships without MinGW binutils on `PATH`, so anything that links a
host artifact (proc-macros, unit tests) fails with:

```
error calling dlltool 'dlltool.exe': program not found
```

The fix is to put Rust's bundled `dlltool`/`ld` on `PATH` — no system MinGW needed:

```sh
bash scripts/with-rust-toolchain.sh <command>
```

An MSVC toolchain is **not** a workaround here: the MSVC C++ build tools are not
installed, and `link` resolves to git-bash's coreutils binary.

### WSL2

```sh
wsl --shutdown                 # the VM instance is flaky on this machine
wsl -e bash -lc "cd /mnt/c/<path>/Nivry/contracts && \
  CARGO_TARGET_DIR=$HOME/nivry-target cargo test --workspace"
```

Use a Linux-native `CARGO_TARGET_DIR`: building into `/mnt/c` is slow and can
collide with a Windows cargo lock.

## Build and test

```sh
# Windows: build both artifacts (treasury first, then registry)
bash scripts/with-rust-toolchain.sh bash scripts/build-contracts.sh

# WSL / Linux
bash scripts/build-contracts.sh
bash scripts/test-contracts.sh
```

Current artifact sizes from a local build:

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `nivry_agent_wallet.wasm` | 274,121 | `ce3b675e2b3d9ab5a11d8840f0e1cd48471438f6a418ddc3bafce21fca4d8e5e` |
| `nivry_registry.wasm` | ~893,000 | changes per build; record per release |

Hashes are recorded here as **local build observations only**. They are not
evidence that any deployed account runs this code, and they must be re-verified
against on-chain bytecode before any immutability claim.

## Units and encoding

| Quantity | Representation |
| --- | --- |
| Native amounts | `U128` — decimal yoctoNEAR **string** on the wire, `u128` in state |
| Deadlines / expiry | `U64` — decimal **nanoseconds** as a string (`u64` exceeds JS `2^53`) |
| Authority epoch | `u64` — a Nivry generation counter, **not** NEAR's blockchain epoch |
| Nonce / sequence | `u64` — monotonic, never reset or reused |
| Hashes | lowercase hex strings |

## Protocol maxima (fixed Day 1)

| Limit | Value | Enforced in |
| --- | --- | --- |
| Recipients per grant | 1..=8 | `set_executor` |
| Manifest `name` | 1..=64 bytes | `Manifest::validate` |
| Manifest `description` | ≤ 256 bytes | `Manifest::validate` |
| Manifest `runtime_hint` | 1..=32 bytes | `Manifest::validate` |
| Manifest `task_kind` | 1..=32 bytes | `Manifest::validate` |
| Manifest `manifest_uri` | 1..=256 bytes, `https://` or `ipfs://` | `Manifest::validate` |
| `bundle_sha256` | exactly 64 lowercase hex chars | `Manifest::validate` |
| Identifier (`token_id`, `operation_id`, `payment_reference_hash`) | ≤ 64 bytes | wallet + registry |
| Grant lifetime | ≤ 90 days | `set_executor` |
| Callback result read | ≤ 256 bytes | `promise_result_checked` |
| Enumeration page | ≤ 100 tokens | `nft_tokens_for_owner` |
| Manifest text charset | printable ASCII, excluding `"` and `\` | `Manifest::validate` |

## What is implemented

* `create_agent` — reserves a monotonic token id and emits a batch of
  `CreateAccount` + `Transfer` + `DeployContract` + `FunctionCall`. **No
  `add_full_access_key` anywhere.**
* `on_create_agent` — private callback; mints on confirmation, refunds the child
  funding on proven failure, marks `Uncertain` otherwise.
* `nft_transfer` — NEP-171 transfer that bumps `authority_epoch`, drops the grant
  and advances `ownership_change_count` in the same receipt.
* `set_executor` / `revoke_executor` / `set_frozen` — rotate authority, drop the
  old grant, refuse to restore anything.
* `execute_payment` — executor-authenticated bound payment (allowlist, per-payment
  cap, cumulative budget, expiry, exact next nonce).
* `owner_withdraw` — same dispatch path, no grant budget.
* `on_dispatch_settled` — private settlement from the treasury's own recorded
  result; an unreadable result is **not** guessed. See "Settlement" below.
* `on_dispatch_status` — private resolution of the treasury's persisted operation
  status, used to prove or refute an unreadable outcome.
* `reconcile_operation` — anyone may trigger the same fixed status query for an
  operation whose registry callback was lost. The caller cannot assert a result.
* Treasury (`agent-wallet`): `pay_agent`, `deposit`, `dispatch_native`,
  `finalize_dispatch`, `treasury_info`, `operation_status`.
* Views: `agent_info`, `provisioning_cost`, `wallet_code_hash`,
  `treasury_account_id`, `next_token_id`.

## Settlement: why there are two steps

A failed promise chain is **not** proof that a transfer failed — the transfer may
have succeeded before finalization failed. So the registry never infers an outcome.

1. `on_dispatch_settled` reads the outcome the treasury itself returned from
   `finalize_dispatch`.
2. If that result is unreadable (failed chain, missing result, unparseable
   payload), the registry chains a fixed `operation_status` query and resolves it
   in `on_dispatch_status`.

| Treasury status | Meaning | Effect |
| --- | --- | --- |
| `null` | never scheduled a transfer for this operation | release lock, restore budget |
| `failed` | terminal, transfer did not complete | release lock, restore budget |
| `succeeded` | terminal, transfer executed | release lock, budget stays spent |
| `pending` | transfer emitted, finalization unknown | **stay locked** |
| query failed | no proof available | **stay locked** |

`null` is a sound proof because `dispatch_native` validates everything **before**
writing its operation record: a rejected call leaves no record behind. That is what
makes it safe to release a lock after a wallet-side rejection, instead of deadlocking
the agent forever.

In every case the nonce stays consumed. Nothing is retried, and nothing is refunded
without proof.

## Deliberately absent

Not stubbed, not silently downgraded — simply missing:

* `list_agent` / `cancel_listing` / `buy_agent` / `withdraw_sale_proceeds`
  (Day 3: inline market and seller credits).
* `nft_approve` — the approval extension is enabled on the standard NFT, but no
  approve method is exposed yet.
* `nft_transfer_call` — **rejected with an explicit panic.** Full NEP-171 core
  support requires provisional ownership, a financial lock and a private resolver.
  Until that exists this is a **restricted prototype**, not NEP-171 compliant.
* Reconciliation of `Uncertain` provisioning (the treasury-status reconciler above
  covers payments, not a lost creation batch).

## Structural guarantees (not policy)

1. Treasury creation contains no key action, so no owner, executor or operator can
   install a key on it.
2. Treasury init is `#[init]` — one-time, bound to the registry and token id, with
   no public reinitializer.
3. Treasury code exposes no upgrade, key-addition, deletion, controller-replacement
   or arbitrary self-action method.
4. `dispatch_native` accepts only its immutable registry as predecessor, with a
   fixed recipient and amount and no caller-selected action or callback.
5. The treasury caches no owner; the registry re-reads the title on every
   authority decision.
6. Executor authentication uses `predecessor_account_id()`, never a supplied owner
   string and never `signer_account_id()`.

## Known limitations

* **Not immutable yet.** Immutability is a deployment property, not a code
  property: it requires removing all access keys from the registry account and
  pinning the code hash. Neither has been done.
* **Registry wasm embeds the treasury wasm**, so every treasury change rebuilds the
  registry. That is intentional — a mutable factory parameter would be a backdoor.
* A failed-provisioning refund returns only `WALLET_INITIAL_BALANCE`; the registry
  keeps the storage allowance for the record it retains.
* `nft_transfer` resets `frozen = false` for the new owner. The freeze is the
  current owner's stop; inheriting it would block the buyer's first grant.
* Provisioning and settlement paths are untested against a live network.
* Settlement can take a third receipt (status query + resolver) when the first
  outcome is unreadable. That is deliberate: correctness over gas.
* `reconcile_operation` needs someone to call it. If every callback is lost and
  nobody reconciles, the agent stays locked — fail-closed, not fail-open.
