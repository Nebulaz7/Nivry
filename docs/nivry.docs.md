# Nivry Backend Architecture Documentation

---

## 1. Bundle Module

### What the Bundle Module Does

An autonomous AI agent needs instructions, prompts, and tool configurations to operate. Together, these files form an **agent bundle**. 

Blockchains like NEAR cannot store large configuration files affordably. For this reason, the on-chain smart contract only stores a cryptographic SHA-256 fingerprint of the bundle. The actual bundle files reside off-chain in the `BundleModule`, a NestJS service located in `backend/src/bundle/`. 

When an agent changes ownership on the marketplace, the new owner retrieves this bundle to execute the agent locally. The Bundle Module guarantees the security and integrity of these files through content-addressed storage and automated validation checks.

```
       [ Upload Request ]
               │
               ▼
   ┌───────────────────────┐
   │ 1. Size & Path Check  │  Reject > 5 MB, > 50 files, or path traversal ("../")
   └───────────┬───────────┘
               ▼
   ┌───────────────────────┐
   │ 2. Secret Scanner     │  Scan for PEM keys, ed25519 keys, .env, API tokens
   └───────────┬───────────┘
               ▼
   ┌───────────────────────┐
   │ 3. SHA-256 Verification│ Compare calculated hash against expected hash
   └───────────┬───────────┘
               ▼
   ┌───────────────────────┐
   │ 4. Storage to Disk    │  Save to `<BUNDLE_STORAGE_DIR>/<sha256>.bundle`
   └───────────────────────┘
```

### Core Architecture and Security Controls

The Bundle Module functions as an automated security filter and verified store:

1. **Secret Leak Prevention:**
   The service scans content bytes for credentials. It rejects uploads that contain NEAR ed25519 keys, PEM private keys, hardcoded credentials, `.env` files, or API tokens (`sk-...`, `wk_...`).

2. **Size and Path Validation:**
   The bundle size cannot exceed 5 MB (`MAX_BUNDLE_BYTES`). The bundle cannot contain more than 50 files (`MAX_BUNDLE_FILES`). Any payload with relative directory sequences like `../` or `..\` is immediately rejected.

3. **Content-Addressed Storage:**
   The service indexes every bundle by its exact SHA-256 digest. It writes incoming data to an atomic temporary file, and renames the file to `<storage_dir>/<sha256>.bundle` once validated.

4. **Tamper Detection on Retrieval:**
   When a user requests a bundle through `GET /bundles/:sha256`, the service reads the file from disk and recalculates the SHA-256 digest. If the hash does not match, the service aborts delivery and returns an error. This prevents corrupted or altered files from reaching execution environments.

### API Endpoints

- `POST /bundles/:sha256`: Validates and writes base64 bundle bytes to disk.
- `GET /bundles/:sha256`: Streams verified bundle bytes with tamper detection.
- `POST /bundles/validate-manifest`: Validates manifest structure and produces canonical JSON and SHA-256 hash.

---

## 2. Chain Module

### What the Chain Module Does

In Nivry, each AI agent is an on-chain NFT title deed on the NEAR blockchain. Each agent also controls a dedicated treasury account that holds funds. 

Our backend runs outside the blockchain. It cannot guess on-chain state, and it cannot trust unverified user claims. The `ChainReaderService`, located in `backend/src/chain/chain-reader.service.ts`, acts as the read-only verification inspector. It queries NEAR RPC nodes using finalized blocks (`finality: 'final'`) to confirm on-chain ownership, verify account locks, and inspect transaction outcomes.

```
                  ┌───────────────────────┐
                  │      User Request     │
                  └───────────┬───────────┘
                              ▼
                  ┌───────────────────────┐
                  │      Chain Module     │
                  │ (ChainReaderService)  │
                  └───────────┬───────────┘
                              │
             Queries NEAR RPC nodes using HTTP JSON-RPC
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
1. Who owns this agent?  2. Is the vault safe?  3. Did the payment clear?
(Calls Registry contract) (Checks for zero keys) (Inspects finalized receipts)
```

### Core Architecture and Verification Mechanisms

1. **Standard HTTP JSON-RPC Connection:**
   The backend connects to NEAR through standard HTTP POST queries to public RPC nodes (`https://rpc.testnet.near.org`). It requests account data and executes view calls using standard JSON payloads.

2. **Agent State and Governance Verification (`getAgentInfo`):**
   The service calls the Registry contract (`registry.nivry.testnet`). It retrieves the true owner, active operator grants, and authority counter (`authority_epoch`). When a user signs a request, the backend verifies their signature and confirms that their identity matches `owner_id`.

3. **Keyless Treasury Verification (`verifyAccountLockState`):**
   A buyer needs mathematical proof that the agent creator cannot secretly drain the treasury. The service calls `view_access_key_list`. If the list is empty (`keys: []`), the account has zero access keys. Nobody holds a private key to that account. Only the deployed smart contract code can move funds.

4. **Authority Epochs and Clean Transfers:**
   When an agent NFT transfers from Bob to Alice on the Registry contract:
   - The contract updates `owner_id` to Alice.
   - The contract increments `authority_epoch` (for example, from 1 to 2).
   - This increment instantly invalidates all previous operator permissions created by Bob.
   - The treasury account keeps its funds intact, but now accepts orders only from Alice.

5. **NEP-297 Standard Event Ingestion (`getFinalTransactionOutcome`):**
   When contracts execute payments, they emit standard log lines (`EVENT_JSON:...`). The chain module extracts these logs and preserves their exact `(receipt_id, log_index)` order.

---

## 3. Database Module

### What the Database Module Does

Blockchains process transactions securely, but they are slow for everyday search queries. Querying the blockchain on every page load causes slow response times. In addition, background tasks (such as code analysis jobs) produce operational state that does not belong on the blockchain.

The Database Module (`DatabaseService` in `backend/src/database/database.service.ts`) serves as the fast local cache, task queue, and event store for Nivry.

```
                  ┌───────────────────────┐
                  │    DatabaseService    │
                  │ (Local Fast Storage)  │
                  └───────────┬───────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
┌──────────────┐      ┌──────────────┐       ┌──────────────┐
│ Agents Cache │      │  Event Store │       │  Task Queue  │
│  Fast lookup │      │  Idempotent  │       │ Single-task  │
│  for tokens  │      │  (no dupes)  │       │ concurrency  │
└──────────────┘      └──────────────┘       └──────────────┘
```

### Key Responsibilities and How It Works

1. **Fast Local Agent Caching (`agents`):**
   The service stores cached snapshots of agent records, owner IDs, and authority epochs. The frontend can list agents and inspect metadata with zero RPC latency.

2. **Duplicate-Proof Event Storage (`eventsByKey`):**
   Network retries can deliver the same blockchain receipt multiple times. The database combines `receipt_id` and `log_index` into a unique composite key (`receipt_id:log_index`). If an event arrives a second time, the database drops the duplicate. This prevents double-counting payments or deposits.

3. **Exact Decimal Precision for Financial Records (`operations`):**
   NEAR amounts use yoctoNEAR ($1 \text{ NEAR} = 10^{24} \text{ yoctoNEAR}$). JavaScript numbers lose precision with values this large. The database strictly validates amounts as non-negative decimal strings (`validateYoctoString`), avoiding rounding bugs.

4. **Single-Task Concurrency (`tasks`):**
   When an agent executes an automated job, the database manages the task lifecycle. The method `claimPendingTask` guarantees single-task concurrency: if an agent already has an active task running, the database prevents a second task from starting simultaneously.

5. **Synchronization Cursors (`cursors`):**
   The database records the block height of the latest processed event. When the backend restarts, it reads the cursor and resumes processing without missing events or re-indexing history.
