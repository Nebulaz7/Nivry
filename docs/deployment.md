# Testnet deployment record

The build script ends with "record these in `docs/deployment.md` before any
immutability claim". This is that record. Everything below was read back from
the chain, not copied from a local build log.

- **Network:** `testnet`
- **Recorded:** 2026-11-11
- **Mainnet:** never deployed.
- **Commit:** `b083020013b0c7343da0a14249f420a5841c9083` (`b083020`).
- **Repository:** https://github.com/Nebulaz7/Nivry

## Accounts

| Account | Role | Held by |
| --- | --- | --- |
| `nivry.testnet` | registry contract + agent NFT owner | full-access key in `~/.near-credentials/testnet/nivry.testnet/` (WSL) |
| `00000001.nivry.testnet` | keyless treasury for token `1` | no access keys, by construction |
| `nivry-b.testnet` | funding source only, now ~0.01 NEAR | full-access key in `~/.near-credentials/testnet/nivry-b.testnet/` (WSL) |
| `nebulaz.testnet` | recorded as registry `owner_id` only | not used to sign anything |

`nebulaz.testnet` appears solely as the `owner_id` argument passed to `new`.
In this codebase authority is derived from the current NEP-171 owner of a token
(`require_owner`), never from the contract-level `owner_id`, so that field grants
no signing power over the deployed contract.

## Artifacts

| Artifact | SHA-256 | Size |
| --- | --- | --- |
| registry wasm | `ee320975806963b8809c8bec2d6f1aca3a70c26936f9f534691fb990a27cdd97` | 984,505 B |
| treasury wasm | `ce3b675e2b3d9ab5a11d8840f0e1cd48471438f6a418ddc3bafce21fca4d8e5e` | 274,121 B |

The registry embeds the treasury WASM at compile time, and `build.rs` pins that
hash into `WALLET_CODE_HASH_HEX`. Confirmed on-chain: `wallet_code_hash()`
returns `ce3b675e…`, and the explorer's local-contract checksum for
`00000001.nivry.testnet` is the same value. That is a bytecode comparison, not a
published claim.

## Transactions

| Step | Transaction |
| --- | --- |
| create `nivry.testnet` (faucet sponsor) | `4WbCuYpGj8CvRkJeHK5q8WdJKZqJSUrDy86RDEz1fFZY` |
| create `nivry-b.testnet` (faucet sponsor) | not recorded |
| fund `nivry.testnet` with 9.99 NEAR | `3r6w81UCcnQEfU7rokKs9zKx9RMKPz8rm1n2f3vaHJyf` |
| deploy registry + `new({owner_id:"nebulaz.testnet"})` | `AhPAc9yuGQmHDCFPVRPikseb1k1qgzbRP9ghq3N6BQ5a` |
| `create_agent` (token `1`, spawns treasury) | `J6Qd2jmNT4osYzDQq2uvZ2x3EFv4pB4EF5YRq1dW7bns` |

## Deployed state

### Registry `nivry.testnet`

| Field | Value |
| --- | --- |
| `wallet_code_hash()` | `ce3b675e2b3d9ab5a11d8840f0e1cd48471438f6a418ddc3bafce21fca4d8e5e` |
| `provisioning_cost()` | `3030000000000000000000000` yocto (3.03 NEAR) |
| `next_token_id()` | `1` before the mint, `2` after |
| account balance | 16.9713003008521849 NEAR |
| storage used | 986.2 KB (9.85 NEAR locked by the code) |

### Agent token `1`

```json
{
  "token_id": "1",
  "owner_id": "nivry.testnet",
  "treasury_account_id": "00000001.nivry.testnet",
  "authority_epoch": 1,
  "version": 1,
  "ownership_change_count": 0,
  "lifecycle": "ready",
  "frozen": false,
  "executor_grant": null,
  "pending_operation": null,
  "pending_transfer_call": null,
  "listing": null,
  "next_command_nonce": 1,
  "manifest_hash": "047e40193f92744a8b439ce91b8fb58bbb4a0de8f76d6e33513b864430235763"
}
```

The manifest is `fixtures/manifest.example.json` (name `Docs Reporter`, task
`docs_report_v1`). Its hash matches the value locked by the unit test in
`contracts/registry/src/manifest.rs`, so the deployed manifest and the canonical
fixture agree byte-for-byte.

### Treasury `00000001.nivry.testnet`

```json
{
  "registry": "nivry.testnet",
  "token_id": "1",
  "balance_yocto": "3000000000000000000000000",
  "spendable_yocto": "146540000000000000000000",
  "storage_reserve_yocto": "2853460000000000000000000",
  "next_sequence": 1,
  "pending": false,
  "recorded_payment_count": 0,
  "recorded_payment_amount_yocto": "0",
  "last_operation": null
}
```

Explorer shows **"Account is locked (no access keys)"**. The 3 NEAR balance is
the storage stake for the 274.3 KB of deployed code plus a small operating
reserve; it is not a gift and is not spendable in full.

## Verification commands

These are the exact `near-cli-rs` 0.31.1 invocations used. Note that
`as-transaction` requires `sign-as <signer>` before `network-config`.

```bash
wsl -e bash -c "export PATH=/home/nebulaz7/.cargo/bin:/usr/local/bin:/usr/bin:/bin; \
  near contract call-function as-read-only nivry.testnet agent_info \
  json-args '{\"token_id\":\"1\"}' network-config testnet now"
```

```bash
wsl -e bash -c "export PATH=/home/nebulaz7/.cargo/bin:/usr/local/bin:/usr/bin:/bin; \
  near contract call-function as-read-only 00000001.nivry.testnet treasury_info \
  json-args '{}' network-config testnet now"
```

```bash
wsl -e bash -c "export PATH=/home/nebulaz7/.cargo/bin:/usr/local/bin:/usr/bin:/bin; \
  near account view-account-summary 00000001.nivry.testnet network-config testnet now"
```

## How this was deployed

1. Build artifacts (Windows host, through the toolchain wrapper):

   ```bash
   bash scripts/with-rust-toolchain.sh bash scripts/build-contracts.sh
   ```

2. There is **no separate treasury deploy step**. The treasury WASM is compiled
   into the registry (`include_bytes!`), and `create_agent` creates, funds,
   deploys and initializes the child account in one receipt.

3. Deploy + init the registry:

   ```bash
   near contract deploy nivry.testnet \
     use-file <repo>/contracts/target/wasm32-unknown-unknown/release/nivry_registry.wasm \
     with-init-call new json-args '{"owner_id":"nebulaz.testnet"}' \
     prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
     network-config testnet sign-with-legacy-keychain send
   ```

4. Mint the fixture agent (`create_agent`, 300 TGas, exact 3.03 NEAR deposit):

   ```bash
   near contract call-function as-transaction nivry.testnet create_agent \
     json-args '{"manifest":{...},"expected_cost":"3030000000000000000000000"}' \
     prepaid-gas '300 Tgas' attached-deposit '3.03 NEAR' \
     sign-as nivry.testnet network-config testnet \
     sign-with-legacy-keychain send
   ```

## Provenance notes

- `nebulaz.testnet` could not be used for deployment: the testnet wallet's dapp
  login is currently broken, so `near login` could never register a CLI key, and
  the account held 7 NEAR against a 9.85 NEAR code-storage requirement.
- `nivry.testnet` and `nivry-b.testnet` were created with
  `near account create-account sponsor-by-faucet-service`, which generates the
  keypair locally and has the testnet faucet sign only the `create_account`
  transaction. No wallet was involved.
- The CLI left a non-functional credential at
  `~/.near-credentials/testnet/nebulaz.testnet/` from the failed login. That key
  does not exist on-chain and must not be relied on.

## What this deployment does not prove

- **Not immutable.** `nivry.testnet` still holds a full-access key, so the code
  can be replaced. Immutability would require removing all access keys after
  deployment, which has not been done.
- **Not audited.** Unit and sandbox tests passed locally; this is a testnet
  contract for a hackathon submission.
- **Not mainnet-ready.** No mainnet deployment, no external review.
- **Only one agent exists.** Seller-credit, listing, buy and
  `nft_transfer_call` paths are covered by unit and sandbox tests but have not
  been exercised against this live contract yet.
