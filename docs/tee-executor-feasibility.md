# OutLayer testnet: per-NFT TEE executor feasibility

Researched **2026-11-06**. Read `docs/agent-nft-authority-research.md` first, then primary OutLayer documentation, its public API specification and pinned keystore source, plus NEAR documentation/specifications. Verified that `Nivry/docs` exists before creating this file. This is the only document created/edited for this research; `PLAN.md` and other documents are unchanged.

**Evidence labels:** **Documented** = first-party supported interface/claim; **Code** = inspected public source, not evidence of deployed bytecode; **Design** = proposed Nivry behavior; **Untested** = no end-to-end execution established. Public documentation/source reads only: no wallet registration, credentials, secrets, authenticated API calls, transactions, paid execution, or deployment/attestation verification. No background-agent tool was available, so research was performed directly.

## Decision

**Conditional GO for the hackathon:** use **one active OutLayer custody NEAR executor account per NFT**, with a **fresh identity after transfer**, authorized by Nivry's current owner/authority epoch. Use the documented **`POST https://testnet-api.outlayer.ai/wallet/v1/call`** to invoke a bounded Nivry payment method directly. Hold the **native NEAR treasury in Nivry's contract**, not in the custody wallet; leave only a small gas float in the executor. No key transfer, OutLayer account binding, vault recovery, or custody-policy controller handoff is required. This is **documented API + code-level feasibility, not a tested integration**. [1–5]

“One per NFT” means **one active executor in the current epoch**, not one unchanging key forever, and not one physical enclave per NFT. Old wallet identities may remain alive at OutLayer but lose their Nivry grant. Independently registered wallets provide distinct identities, not independent custody roots: default wallets share OutLayer's master/governance trust boundary. [1,3,4]

**Custom ed25519 verification is possible, but not simpler than the direct predecessor route for this scope.** NEAR `/sign-message` signs NEP-413 envelopes, not arbitrary raw bytes; `/auth-sign` signs fixed OutLayer challenges. The documented raw-message route is `/wallet/v1/solana/sign-message`, using the wallet's **different Solana-derived ed25519 key**. That can authorize a NEAR contract cryptographically without a Solana transaction, but adds a relayer, payload encoding, signature verification and replay protection. Keep it as an alternative, not an assumed NEAR raw-signing API. [2,5–8]

## 1. Exact supported custody-to-contract method

### Documented interface

OutLayer specifies the testnet host as **`https://testnet-api.outlayer.ai`**. Network selection is by host, not a JSON network parameter. Testnet and mainnet credentials are separate. Native custody calls, transfers, policies and message signing are documented on both networks; Intents-dependent operations lack testnet solvers and return 503. This proposal uses **neither Intents nor a paid WASM project/connector**. [1,2]

| Step, for a later authorized spike | Exact interface | What it establishes / does not establish |
| --- | --- | --- |
| Create an independent random wallet | `POST /register`, empty body or `{}`; no external NEAR signature required | Returns `api_key`, `wallet_id`, `near_account_id`. Registration derives an address; it does **not** fund/create its usable on-chain account or authorize it in Nivry. |
| Resolve NEAR identity | `GET /wallet/v1/address?chain=near`, `Authorization: Bearer <wallet credential>` | Use `address` as the executor account; schema also describes `executor_account_id` equal to `address`. Do not use `wallet_id` or the API-key hash as predecessor. |
| Fund gas | Separate native testnet NEAR funding transaction, outside this research | An implicit account needs to exist with the expected access key and have gas funds before `/call` can sign successfully. Registration is not a gas sponsor. |
| Owner authorizes it | A **proposed Nivry method**, authenticated by the NFT owner's predecessor | Stores executor/owner/epoch and bounds. This is not an OutLayer registration feature. |
| Invoke Nivry | `POST /wallet/v1/call` with wallet Bearer auth | Signs and broadcasts a normal NEAR function-call transaction from the custody account, subject to OutLayer policy. |
| Reconcile | Returned `request_id`, `status`, `tx_hash`; `GET /wallet/v1/requests/{id}` where needed, plus chain receipts | API acceptance or a hash alone is not proof the final treasury payout succeeded. |

These interfaces and semantics are documented in [1–3,5]; transaction construction is corroborated by source [4]. **None of these operations was performed.**

For Nivry, the request body would have this shape (notation only; **not executable**, and names under `args` are a proposed Nivry interface):

```text
receiver_id = deployed Nivry contract account on testnet
method_name = execute_payment
args = {
  token_id,
  expected_owner_id,
  authority_epoch,
  nonce,
  receiver_id,
  amount_yocto,
  deadline_ns
}
gas = decimal raw gas units, sized by measurement
deposit = "0"
```

The HTTP schema accepts an `args` JSON object; it also describes `args_base64` for non-JSON encoding. Rust JSON methods need only `args`. Existing examples use `"gas":"30000000000000"` for 30 TGas: despite a schema description saying “in TGas,” the examples and inspected keystore `Gas::from_gas(gas)` use **raw gas units**, not `"30"`. Measure enough for the method, transfer receipt and callback. [2,3,4]

**Why predecessor works (Code + NEAR semantics):** `sign_near_transaction` derives `wallet:{wallet_id}:near`, sets `signer_id` to the hex ed25519 public key (implicit account), fetches its access-key nonce/block hash, signs the transaction hash and returns the signed transaction. `sign_built` turns `Op::Call` into a single `FunctionCall` with the selected receiver/method/args/gas/deposit. For a direct call, NEAR makes signer and predecessor the executor account. Nivry should check **`env::predecessor_account_id()`**, not a caller-supplied account, `wallet_id`, or just `signer_account_id()`. [4,9]

This is an arbitrary **call destination/method/arguments** primitive within API validation and policy limits, **not** arbitrary native account action submission, unconstrained execution, or an NFT-aware grant. A helper contract inserted in the call path changes predecessor. Agent Connect's `w_execute_extension`/binding lanes add unrelated restrictions and are unnecessary here. [3,4,9]

**Policy is defense in depth, not the treasury authority.** Restrict the executor to the necessary call lane and small gas float; disable unused signing/Intents/delete capabilities where supported. OutLayer counts a generic call's attached deposit as native spend; a zero-deposit Nivry call can cause Nivry to transfer much more from its own treasury. Do **not** rely on an OutLayer attached-deposit cap to bound Nivry payments or assume it semantically understands custom `amount_yocto` arguments. Enforce all treasury limits inside Nivry. A wallet without policy is documented as unrestricted. [2,3]

## 2. Registration authority and executor key are separate

| Registration choice | Identity separation | Authority left with the registrar |
| --- | --- | --- |
| **Independent random wallet per token/epoch — recommended** | `/register` needs no external NEAR key. Each wallet has its own credential, ID and derived address. | Anyone retaining its `wk_` can request signatures/calls under its policy. Provision into the current owner's/operator's secret store, not a seller-controlled shared store. Fresh wallet on sale avoids credential handoff. |
| Deterministic wallet per token/epoch seed | Derived from `(account_id, seed, vault scope)`; the authenticating account's full-access ed25519 key is **not** the custody executor key. Distinct seeds can produce distinct executors. | The authenticating account still controls API access. The same account/seed/scope returns the same wallet. Changing which full-access key signs does not change executor identity. A platform registration account remains an authority over all its derived wallets. |
| Parent custody sub-wallet per seed | `PUT /wallet/v1/api-key` with parent Bearer auth creates deterministic child-wallet identities, not merely replacement API keys for one wallet. | The parent retains derivation/provisioning authority; distinct children are not independent of the parent credential. Do not describe this as eliminating registrar control. |

These are **documented**, not tested here. Deterministic registration and Bearer auth require full-access ed25519 signatures, not a function-call key or arbitrary NFT ownership proof. A public key alone cannot authenticate; the corresponding valid signature/credential is required. Docs say removal of an authenticating NEAR key takes effect within 60 seconds due to cache TTL; delegate-key deletion can refuse the last active key with 409. Neither delay nor last-key restriction matters to **Nivry's local grant invalidation** if transfer clears the grant in contract state. [1–3,5]

**Independence answer:** yes, the external deterministic-registration key and TEE-derived executor key are distinct; no, that does **not** make their authorities independent. A registrar who can still authenticate can still drive the executor while Nivry authorizes that identity. If the buyer reauthorizes the same seller-accessible wallet, even with the new epoch, the seller can learn the public epoch and submit fresh valid calls. **An epoch is not a secret. A fresh owner-controlled credential AND fresh executor identity are the clean handoff.** Independent random registration avoids an external registration-account key entirely, but the credential holder and OutLayer infrastructure still have their stated roles. [3–5]

A logical revoke means: “this credential/key can no longer exercise **this Nivry token's grant**.” It does **not** delete the API credential, destroy the signing key, freeze the old wallet, revoke its other permissions, erase seller copies, or recover its gas float. Do not let the executor register its own replacement: only the **current NFT owner** can authorize/rotate/revoke. No automatic OutLayer callback on transfer is necessary for this narrower guarantee. **Design**, grounded in the separate identities above.

## 3. Minimal immutable Rust authority/treasury design

**Design recommendation; no Nivry contract implementation exists in this research.** Co-locate the authoritative NFT ownership, authority epoch, executor grant and token treasury ledger in one immutable contract. NEAR cross-contract calls are asynchronous: a separate contract's `nft_token` view does not give a synchronous atomic ownership check. Standard NEP-171 also does not supply an authority-epoch field; Nivry must implement it. [9–11]

Suggested per-token state:

```text
owner_id
owner_epoch                  // Nivry authority generation, NOT env::epoch_height()
executor_grant: None | { executor_account_id, authorized_owner_id, epoch, bounds }
next_nonce                   // checked monotonic counter, or equivalently safe replay state
available_native_near
pending_payments             // payment id -> immutable amount/token/epoch/status
```

Owner authorization/rotation/revocation must authenticate the **predecessor against current owner**, reject stale expected epoch, and invalidate the old grant. Increment the authority generation on same-owner executor replacement/revocation too, or use an additional grant generation; never allow old requests to revive if an identity is later reinstalled. If strict one-identity-per-token isolation matters, reject assigning an already-active executor to another token (reverse map), and check token ID on every execution. These are Nivry requirements, not provider guarantees.

At the `execute_payment` receipt, require all of:

1. Token exists, is not burned, and is not in unresolved transfer/handoff/frozen state.
2. Request's expected owner equals the **current authoritative owner**; request epoch equals the current authority epoch; grant's saved owner and epoch also match. This is a consistency/staleness check, not a requirement that the executor also be the NFT owner.
3. `predecessor_account_id == grant.executor_account_id`. Do not confuse it with signer public key, signer account, a registry worker key, or the owner supplied in JSON. [9]
4. Exact next application nonce and unexpired deadline, with checked arithmetic and defined time units. NEAR transaction nonces prevent duplicate transaction submission, **not** the same payment request wrapped in a fresh transaction. [4]
5. Native NEAR only; positive bounded amount; on-chain recipient allowlist, per-payment ceiling, and strict cumulative grant budget as desired. A per-payment limit alone allows repeated draining up to the entire available balance.
6. Sufficient **that token's** available balance and sufficient aggregate contract liquidity after reserving storage/operational balance and outstanding payments. Attached execution deposit is zero; funding uses a separate payable token-credit method. Never let executor identity imply access to all pooled funds.
7. Consume nonce/budget and reserve/debit token balance **before** creating `Promise::new(recipient).transfer(amount)`. No arbitrary target-method/action forwarding, AddKey, deploy, delete, unlimited approvals or caller-selected callback. [10]

Native NEAR held by one contract is pooled at account level; “token treasury” is a contract-enforced sub-ledger, not automatically one NEAR account per NFT. `pay_agent(token_id)` must credit the right ledger and record earnings separately from deposits/refunds so a refund cannot manufacture earnings. No executor key is installed on the treasury contract account. **Design**.

### Transfer and asynchronous boundaries

- Every ownership-changing path must atomically update owner, increment generation and clear the executor: direct `nft_transfer`, approved marketplace transfer, transfer-call movement and any resolution returning ownership, plus relevant burn/recovery paths. Do this in the NFT's common internal transition logic, not only the marketplace. NEP-171 explicitly includes transfer-call resolution and rollback. [11]
- **Lock execution and executor authorization during unresolved `nft_transfer_call`.** Otherwise a temporary recipient could authorize an executor and spend before the token is returned. Resolution must not restore a stale executor/epoch merely because it restores prior ownership; use monotonic generations. Audit chained transfer/retransfer behavior, not just the happy path. [11]
- Payment scheduling and recipient delivery are separate receipts. Mark scheduled versus succeeded/failed; settle through a private, idempotent callback keyed by immutable payment ID. Restore the appropriate token balance only on confirmed failure. A callback after sale must settle the original reservation, never overwrite the buyer's grant or credit an arbitrary caller; reserve enough callback gas and make reconciliation possible. [10,12]
- **Precise revocation point:** once the owner/epoch change executes in Nivry, later authorization attempts under the old grant fail, even if their API request/signature/transaction was prepared earlier. A payment already authorized and emitted as a transfer promise **can deliver after sale**. Epoch changes cannot retract it. For a clean sale demo, freeze new spends and drain/settle outstanding payments before ownership change, or explicitly disclose outstanding reservations. No wall-clock “instant cancellation of every in-flight action” claim. [10–12]

**Immutability gate:** direct-deploy the intended WASM or reference a global contract **by code hash**, remove **all access keys** for the strongest simple claim, and expose no code upgrade, key-addition, deletion, arbitrary self-action, reinitialization or administrative balance/authority bypass. A mutable global-contract-by-account-ID reference is not immutable after removing local keys. Record deployed code hash and final key list before claiming immutability; none was inspected here. Mutable owner/grant state is intended and is not a code upgrade. [11,13]

## 4. Is custom ed25519 payload verification simpler?

| Route | Exact signing method | Feasibility and trade-off |
| --- | --- | --- |
| **A. Direct predecessor, preferred** | `/wallet/v1/call` from NEAR custody identity | Documented testnet route; code constructs a direct transaction. No custom signature parser or separate relay needed. Each executor needs testnet gas. **Untested end to end.** [1–4] |
| **B. NEAR key + Nivry payload in NEP-413** | `/wallet/v1/sign-message` with `message`, `recipient`, optional 32-byte base64 nonce | Documented, same NEAR key. Relayer submits to Nivry, which reconstructs the full NEP-413 digest and verifies it with its owner-authorized executor pubkey. More code than A, but a standard envelope and no need to fund each signing identity for off-chain signing. Relayer pays NEAR gas. **Untested end to end.** [2,4,6–8] |
| **C. Raw ed25519 with a different derived key** | `/wallet/v1/solana/sign-message`, `chain: "solana"`, UTF-8/hex/base64 message | Documented raw bytes, base58 64-byte signature, policy `solana_sign.allowed` needed under a policy. Register the **Solana** 32-byte public key in Nivry, not the NEAR key. No Solana RPC, SOL, or transaction is needed for signature-only use. Provider rejects bytes parsing as a Solana transaction message and enforces message limits. Cryptographically suitable for Nivry; cross-use and testnet availability of this exact flow need confirmation/testing. [2,3,4,7,8] |
| **Not a supported public arbitrary-NEAR-bytes recipe** | `/sign-message {format:"raw"}` or custom `/auth-sign` message | Raw format is explicitly refused (400); `auth-sign` builds fixed `auth`/`register`/`api-key` challenges with a server timestamp. Neither signs a free-form Nivry payment payload as raw NEAR bytes. [2,3] |

**Code nuance:** internal coordinator-only keystore `/wallet/sign` implements `Op::Raw` through `sign_hash_pinned`, including a NEAR path gated by `raw_sign`. This is evidence that a low-level primitive exists, **not** a documented public `/wallet/v1/*` recipe accessible with `wk_`. Do not invent `/wallet/v1/sign` or use internal coordinator credentials. Ask OutLayer for an expressly supported public interface if arbitrary raw signing with the **NEAR** key is a requirement. [3,4]

### Safe signature-only shape (Design)

A relayed signature route changes the contract API: predecessor is the **relayer**, not the executor. Authorize the registered public key's valid signature instead; do not require a custody-account predecessor at the same time and then wonder why relaying fails. Keep routes explicit and never introduce an unsigned fallback. A signature proves possession/use of the authorized key, **not TEE origin** by itself. [8,9]

Use a fixed typed canonical encoding (e.g. Borsh), not unconstrained JSON-string equivalence or colon concatenation. Reconstruct every security-relevant field from typed arguments:

```text
NIVRY_EXECUTE_PAYMENT_V1
network_domain = fixed configured testnet identifier
contract_id = env::current_account_id()
token_id, current_owner_id, authority_epoch, grant_generation_if_separate
operation = native_near_payment
recipient, amount_yocto, application_nonce, deadline_ns
```

Bind chain/network and contract to stop cross-deployment replay; bind token, owner, authority generation, recipient and amount to stop substitutions. Pin the owner's approved executor **public key**, rather than trusting a pubkey supplied with each request. `env::ed25519_verify` takes 64-byte signature, message bytes and 32-byte public key and returns a bool; reject malformed lengths/encoding. Consume nonce and budget in the same receipt before emitting the transfer. Do not use this signature primitive alone as owner-account authentication. [8,9]

For B specifically, define `message` as the canonical Nivry payload's agreed text encoding; fix `recipient` to the Nivry deployment and `callback_url = None`; reconstruct:

```text
digest = SHA256(
  LE_u32(2147484061)
  || Borsh(message: String, nonce: [u8;32], recipient: String,
           callback_url: Option<String> = None)
)
ed25519_verify(signature_bytes, digest, registered_near_pubkey_bytes)
```

Verifying only `message.as_bytes()` is wrong for NEP-413. `signature_base64` is the encoding of the signature bytes, **not** evidence that raw message bytes were signed. Fix an application nonce in the payload; the envelope nonce alone is not replay protection unless Nivry tracks it. OutLayer's source `sign_nep413` confirms this serialization/hash/key path. [2,4,6]

For C, verify the exact raw canonical bytes against the registered Solana public key; do not add an undocumented SHA-256 step or compare it to the NEAR implicit address. Source derives `wallet:{id}:near` and `wallet:{id}:solana` separately. Leave this identity's Solana balance empty and raw-transaction signing disabled; the Nivry payload must fit the documented endpoint constraints. [4,7]

**Recommendation:** A is simplest for the requested predecessor-based bounded payment. B is the first alternative if a single gas-paying relayer materially improves the demo. C makes the verifier smaller than B but changes key identity and adds a provider integration question; it is not demonstrably simpler overall. All are much narrower than transferring control of an OutLayer wallet or integrating arbitrary NFT auth into its policy controller.

## 5. Gates before changing “feasible” to “works”

**All operational gates below remain open.** These are suggested future tests/questions, not actions performed by this research.

1. **Testnet service gate:** independently register two wallets, verify distinct NEAR addresses, fund their gas, call a small diagnostic method and inspect actual predecessor/receipt outcomes. Then exercise a real bounded Nivry payment using `/wallet/v1/call`. Confirm gas units, policy configuration and current API/schema mismatches rather than copying examples blindly. [1–4]
2. **Authority gate:** register under buyer-controlled credentials without a retained seller/platform parent; prove only owner can authorize. Test A→B transfer, same-owner revoke/replace, A→B→A, burn/remint policy and stale owner registration races. If reusing identities is allowed, explicitly demonstrate the weakened credential guarantee. [5,11]
3. **Adversarial treasury gate:** reject wrong predecessor, owner, epoch, token, nonce, expiry, recipient and amount; repeat with **fresh NEAR transactions**, not only duplicated tx hashes. Prove cumulative-budget enforcement under concurrent submissions, token-ledger isolation, storage reserve and overdraw rejection. [9,10]
4. **Async/transfer gate:** queue an old request before transfer and deliver it after; reject it at Nivry's gate. Separately show an already-emitted payout may settle after transfer. Test transfer-call failure/return, temporary-owner attempts, payout failures and callbacks after grant replacement. [10–12]
5. **Locking gate:** inspect published code hash/key list and every upgrade/admin/self-action path. A local Rust test or “immutable” variable does not prove deployed account immutability. [11,13]
6. **Signing alternative gate, only if needed:** obtain B/C signatures and verify exact bytes locally then in sandbox/testnet, including negative vectors for field changes, network/contract/token substitution, replay, expiry and old epochs. Ask OutLayer whether raw Solana-message signing is enabled on the current **testnet** deployment for this non-Solana verifier use. No public arbitrary-raw-NEAR endpoint was established. [2–4,6–8]
7. **TEE evidence gate:** identify the actual testnet keystore build/registration and evidence linking the authorized custody identity to that key-derivation/signing implementation. Distinguish it from ephemeral compute-worker registration. Public source and a plain NEAR signature are not proof of deployed code, non-exportability or a specific execution attestation. No portable per-custody-call proof for this flow was collected or verified. [2,4,14]

**Known source inconsistencies:** the pinned OpenAPI registration examples/descriptions still mention NEP-413 while current register/auth docs require **raw ed25519** for deterministic auth; parts of the vault-registration docs conflict about accepted scope; the gas description conflicts with examples/source. Keep the random-wallet/direct-call path to avoid those unnecessary dependencies. Public docs/source are not a deployment audit. [2–5]

## 6. Honest security/demo claims

**Safe architecture description now:**

> Proposed Nivry design: an immutable NEAR contract holds per-NFT treasury balances. The current NFT owner authorizes one OutLayer custody executor for the current authority epoch. OutLayer documents TEE-derived signing and a testnet direct-call API. Transfer invalidates the old Nivry grant; the buyer separately authorizes a fresh executor. No signing key is transferred.

**After the corresponding gates pass**, a demo may say:

> This testnet payment was submitted from the token's authorized custody executor and bounded by Nivry's on-chain rules. After ownership/epoch changed, Nivry rejected the old executor; the new owner authorized a fresh identity and successfully paid. The old credential may still work at OutLayer, but cannot exercise the retired Nivry grant.

Do **not** claim:

- “The NFT transfers the TEE private key/API credential,” “all credentials are destroyed,” or “the buyer gets exclusive control of the old custody wallet.” It transfers contract-defined economic authority, then requires reauthorization.
- “Only Hermes can use the key,” “TEE-attested Hermes,” “attested model reasoning/prompts,” or “a genome hash proves execution.” Hermes can run outside the TEE and send requests using `wk_`; any credential holder can request the same allowed actions. Custody signing is not proof of the originating runtime. OutLayer's own docs explicitly distinguish agent-originated requests from TEE policy/signing. [2,14]
- “One dedicated enclave per NFT.” Separate derived custody identities are not separate hardware workers or custody roots. Compute-worker keys are ephemeral registration identities with scoped OutLayer resolution permissions, not per-NFT treasury executors. [2,4,14]
- “Trustless/unhackable/provider can never obtain a key.” The pinned custody model discloses single-key build approval, key-based upgrades and a DAO full-access-key path capable of obtaining the shared master outside an enclave. These disclosures qualify broader marketing claims. They were not independently checked on testnet; do not assert they are absent there. A compromised **currently authorized** executor can still spend within Nivry's grant; on-chain bounds are the damage limit. [3]
- “Sale undoes all in-flight payments” or “seller cannot run the copied agent.” The guarantee is future Nivry authorization under the retired grant, not erasure, cancellation of emitted promises, external credential revocation, or recovery of prior payments.
- “The treasury wallet address stays the OutLayer address.” In this design the stable treasury is the Nivry contract/token ledger; the executor address rotates. This is a deliberate change from the broader wallet-handoff story in `README.md`, not a verified provider feature or a change to that document.

**Bottom line:** OutLayer testnet's documented direct custody call is sufficient in interface and public signing code for a per-token executor **without key transfer**. Nivry must supply atomic owner/epoch/grant enforcement and real treasury bounds. Registration-authority independence is conditional on provisioning; raw custom signing is an optional, more complex alternative. The integration, deployed immutability, handoff tests and TEE evidence remain **untested/unverified**.

## Primary sources

Read on 2026-11-06. Numbered citations above identify evidence, not instructions to execute endpoint examples.

1. [OutLayer custody skill — configuration, testnet support, registration, address, gas model](https://skills.outlayer.ai/agent-custody/SKILL.md). Mainnet/testnet host split; network credential scope; native operations versus Intents.
2. [OutLayer Agent Custody documentation](https://app.outlayer.ai/docs/agent-custody). Direct calls, signing, policies, testnet limitations, API responses and agent-versus-TEE distinction.
3. [Custody model, pinned commit `a2a8510528d9c8051e63765783d1e4ed998a273a`](https://github.com/out-layer/outlayer/blob/a2a8510528d9c8051e63765783d1e4ed998a273a/docs/NON_CUSTODIAL.md). Derivation, authentication trust boundary, no-policy default, controller/governance qualifications. [Raw text](https://raw.githubusercontent.com/out-layer/outlayer/a2a8510528d9c8051e63765783d1e4ed998a273a/docs/NON_CUSTODIAL.md).
4. [Keystore API source, same pinned commit](https://github.com/out-layer/outlayer/blob/a2a8510528d9c8051e63765783d1e4ed998a273a/keystore-worker/src/api.rs). Inspected `wallet_seed_impl`, `wallet_derive_address_handler`, `sign_near_transaction`, `sign_built`, `sign_nep413`, `sign_hash_pinned`, `solana_sign_bytes`, `wallet_solana_sign_message_handler`, and coordinator-only route boundary. [Raw source](https://raw.githubusercontent.com/out-layer/outlayer/a2a8510528d9c8051e63765783d1e4ed998a273a/keystore-worker/src/api.rs).
5. [OutLayer register/auth reference](https://skills.outlayer.ai/agent-custody/references/register-and-auth.md). Deterministic seeds, full-access authentication key versus custody key, sub-wallets, key revocation and independent random-wallet alternative.
6. [OutLayer wallet operations reference](https://skills.outlayer.ai/agent-custody/references/wallet-ops.md); [NEP-413 specification](https://github.com/near/NEPs/blob/master/neps/nep-0413.md). NEP-413 serialization/signature encoding, raw-format rejection and fixed auth-sign challenges.
7. [OutLayer EVM/Solana signing reference](https://skills.outlayer.ai/agent-custody/references/signing-evm-solana.md). Raw Solana ed25519 message signing, encoding, capability and transaction-message rejection.
8. [near-sdk `env::ed25519_verify`, version 5.30.1](https://docs.rs/near-sdk/5.30.1/near_sdk/env/fn.ed25519_verify.html). Host signature-verification interface; no Rust project/dependency version was added or tested.
9. [NEAR environment documentation](https://docs.near.org/smart-contracts/anatomy/environment). Predecessor versus signer, contract balance, deposit, timestamp and blockchain epoch meanings.
10. [NEAR transfers and actions](https://docs.near.org/smart-contracts/anatomy/actions). Native `Promise::transfer`, receipt-level batching, storage reserve, access keys and locked accounts.
11. [NEP-171 specification](https://github.com/near/NEPs/blob/master/neps/nep-0171.md). Ownership, approved transfers, transfer-call resolution/return and removal of account keys.
12. [NEAR private callbacks](https://docs.near.org/smart-contracts/security/callbacks). Asynchronous callbacks must be restricted to self.
13. [NEAR contract updates and locking](https://docs.near.org/smart-contracts/release/lock). Retrieved page is titled “Updating Contracts”; covers full-access/programmatic upgrades and global-contract ID versus code-hash immutability.
14. [OutLayer Trust & Verification](https://app.outlayer.ai/docs/trust-verification). Compute-worker registration, ephemeral keys, keystore derivation, attestation verification boundaries and source-to-binary limitations.
15. [OutLayer public OpenAPI, pinned commit `ecdb068b2ce5db575a52741b18a9c70b72cf4011`](https://github.com/out-layer/api-spec/blob/ecdb068b2ce5db575a52741b18a9c70b72cf4011/openapi.json). Read as corroborating schema for `/register`, `/wallet/v1/address`, `/wallet/v1/call`, `/wallet/v1/sign-message`, `/wallet/v1/auth-sign`, `/wallet/v1/solana/sign-message`, and their request/response types. References [3–4] discuss trust/code; this schema is **not** proof of deployed behavior. [Raw schema](https://raw.githubusercontent.com/out-layer/api-spec/ecdb068b2ce5db575a52741b18a9c70b72cf4011/openapi.json).

**Citation note:** endpoint/schema discussion citing [3] for custody-model constraints and [4] for keystore behavior is additionally corroborated by the public OpenAPI [15]. The existing `docs/agent-nft-authority-research.md` provides background on why full custody handoff, account binding and vault recovery are broader and separate problems; its findings were not silently promoted into operationally tested claims here.
