# Day 1 Spikes and Architectural Decisions

Date: 2026-11-06  
Team: Nebulaz (Contracts) & Dev B (Backend & Runtime)

---

## 1. Spike: Cross-Language Manifest Verification

**Goal:** Ensure the TypeScript packer (`packages/shared`) and the Rust registry contract (`contracts/registry/src/manifest.rs`) compute identical canonical JSON and SHA-256 hashes for any published agent bundle.

**Findings & Validation:**
- The canonical serialization rule:
  - Exact key order: `schema_version`, `name`, `description`, `runtime_hint`, `bundle_sha256`, `task_kind`, `manifest_uri`.
  - No whitespace or line breaks.
  - Printable ASCII only (disallows `"` and `\`), eliminating JSON escaping discrepancies across platforms.
- Test fixture validation from `fixtures/manifest.example.json`:
  - Canonical string:
    `{"schema_version":"1","name":"Docs Reporter","description":"Produces a repository documentation report.","runtime_hint":"hermes","bundle_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","task_kind":"docs_report_v1","manifest_uri":"https://example.invalid/bundles/docs-reporter.tar.gz"}`
  - Verified SHA-256 hash:
    `047e40193f92744a8b439ce91b8fb58bbb4a0de8f76d6e33513b864430235763`
- Automated test added to `packages/shared/src/manifest.test.ts` to assert this exact string and hash on every build.

---

## 2. Spike: OutLayer TEE Executor Integration & Decision

**Goal:** Determine whether the executor identity can be provisioned through OutLayer's TEE custody API on testnet without risking treasury safety or blocking the 7-day delivery plan.

**Decision & Architecture:**
- **Treasury stays keyless:** The treasury account on NEAR has zero access keys. Neither OutLayer nor the seller nor the buyer holds a private key to the treasury account.
- **Executor identity is replaceable:** The executor is an independently registered testnet custody identity that holds only a small testnet NEAR gas float.
- **Call flow:** Hermes requests `POST https://testnet-api.outlayer.ai/wallet/v1/call` to call `execute_payment` on the Nivry registry. The registry enforces all spending caps, allowlists, and authority epochs.
- **Go / No-Go Fallback:** If OutLayer testnet endpoints experience latency, policy restrictions, or unavailability during testing, the backend will toggle to a local disposable testnet key pair. The frontend will display a clear `Local Key (Non-TEE)` label to preserve complete transparency.

---

## 3. Spike: Event History and Indexing Source

**Goal:** Choose a reliable strategy to capture finalized chain events and transactions into PostgreSQL (`infra/init.sql`).

**Findings:**
- Public NEAR RPC endpoints (`https://rpc.testnet.near.org`) do not provide a universal, long-term historical event query endpoint per account without an external indexer (e.g. NearBlocks or Pagoda Lake).
- Relying exclusively on third-party testnet indexers introduces potential downtime risks for the hackathon demo.

**Selected Strategy for MVP:**
1. **Direct Receipt Capture:** Every transaction initiated through the NestJS backend or web app immediately waits for the full execution outcome and persists the resulting receipts and logs into PostgreSQL.
2. **Account Polling for Incoming Payments:** For external customer payments made directly to `pay_agent`, the NestJS worker polls account transactions via standard RPC, parses event logs (`EVENT_JSON`), and writes them into `events` using idempotent `(receipt_id, log_index)` keys.
3. **Fail-Safe Labeling:** If external indexer coverage is incomplete, the UI explicitly labels history as "Observed receipts from active session" rather than claiming an exhaustive archive.

---

## 4. Spike: Hermes Task Adapter (`docs_report_v1`)

**Goal:** Define a bounded, deterministic task format for the AI agent demonstration.

**Format & Execution:**
- **Task Kind:** `docs_report_v1`
- **Input:** Bundled repository files or fixture code directory.
- **Action:** Generates a structured markdown documentation report (modules, exported methods, dependency list, and summary).
- **Output Schema:**
  - `report_markdown`: String
  - `files_analyzed`: Array of file paths
  - `summary`: Short text summary
  - `generated_at`: ISO 8601 timestamp
  - `output_sha256`: SHA-256 hash of the generated report markdown
- The output hash and task completion status provide the trigger for the simulated customer to invoke `pay_agent` and for the executor to disburse authorized funds.

