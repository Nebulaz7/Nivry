# Nivry CLI (`@nivry/cli`)

Command-line tool for packing sanitized public agent bundles, inspecting live on-chain agent and treasury state, and verifying the deployed testnet demo end to end.

## Running the CLI

```bash
node packages/cli/dist/index.js <command> [options]
```

If you need to rebuild the shared library and CLI from TypeScript sources:

```bash
backend/node_modules/.bin/tsc -b packages/shared
backend/node_modules/.bin/tsc -b packages/cli
```

---

## Commands

### 1. `pack <dir> [--manifest <file>] [--out <file>]`

Validates and deterministically packs a sanitized public agent directory into the `nivry-bundle-v1` archive format.

**What it does:**
- Scans all top-level files in `<dir>` (sorted deterministically) and rejects forbidden credential files (`.env*`, `id_rsa`, `id_ed25519`, `credentials.json`), symlinks, and `../` path traversal sequences.
- Runs the secret scanner to block NEAR `ed25519:` private keys, PEM private key headers, `PRIVATE_KEY=` / `SECRET_KEY=` assignments, `sk-...` API tokens, and `wk_...` credentials.
- Enforces protocol size bounds (max 50 files, max 5 MB).
- Computes the exact `bundle_sha256` digest matching the backend's `BundleService`.
- With `--out <file>`, writes the packed `.bundle` bytes to disk.
- With `--manifest <file>`, binds the computed `bundle_sha256` into the manifest JSON, validates it against contract protocol bounds, and prints `manifest_hash` and `canonical_json`.

**Example:**

```bash
node packages/cli/dist/index.js pack fixtures/sample-repo --manifest fixtures/manifest.example.json
```

---

### 2. `status <token-id> [--json]`

Reads finalized NEAR blockchain state directly via RPC (`finality: 'final'`) for a given agent NFT token ID, without requiring the NestJS backend to be running.

**What it does:**
- Calls `agent_info` on the registry contract (`nivry.testnet` by default) to fetch `owner_id`, `treasury_account_id`, `authority_epoch`, `version`, `lifecycle`, `frozen` / `listing` / `pending_operation` flags, active `executor_grant`, and `manifest_hash`.
- Queries `treasury_info` on the agent's child treasury account to inspect total balance, spendable balance, storage reserve, and recorded service payments.
- Proves treasury lock integrity by checking:
  1. `view_access_key_list` has `0` access keys (`is_keyless`).
  2. The account's `code_hash` matches the registry's pinned `wallet_code_hash()`.
- Prints `locked_release` only when both checks pass; otherwise reports `development/unverified`.
- With `--json`, outputs raw `{ agent, treasury, lock }` JSON.

**Example:**

```bash
node packages/cli/dist/index.js status 1
```

---

### 3. `demo [token-id]`

Runs a 5-step end-to-end verification check against the live testnet deployment and local deterministic task fixtures (defaults to `token_id = 1`).

**Checks performed:**
1. **Registry contract is deployed:** Verifies `nivry.testnet` has active contract code on-chain.
2. **Agent exists and is ready:** Calls `agent_info` and confirms `lifecycle === 'ready'`.
3. **Treasury is keyless and runs the pinned wallet code:** Confirms `0` access keys and matching `wallet_code_hash()`.
4. **Deployed manifest equals `fixtures/manifest.example.json`:** Computes canonical manifest SHA-256 locally and verifies it matches on-chain `manifest_hash`.
5. **Hermes `docs_report_v1` reproduces its published hash:** Executes `runtime/hermes/run-docs-report.mjs` against `fixtures/sample-repo` and confirms `output_sha256` equals `997a048a0f03ea1ecce7df320609b980ac1e7c0db0c97aad31dade52791b4fac`.

**Example:**

```bash
node packages/cli/dist/index.js demo 1
```

---

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `NEAR_RPC_URL` | `https://rpc.testnet.near.org` | NEAR JSON-RPC endpoint used by `status` and `demo`. |
| `REGISTRY_CONTRACT_ID` | `nivry.testnet` | Deployed Nivry NFT registry contract account ID. |
| `NIVRY_ROOT` | *(auto-detected)* | Repository root path containing `fixtures/` and `runtime/hermes/` when invoking `demo` outside the repo checkout. |

