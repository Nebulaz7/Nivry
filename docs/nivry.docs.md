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

## 2. Verifier Module (formerly Chain)

### What the Verifier Module Does

In Nivry, each AI agent is an on-chain NFT title deed on the NEAR blockchain. Each agent also controls a dedicated treasury account that holds funds. 

Our backend runs outside the blockchain. It cannot guess on-chain state, and it cannot trust unverified user claims. The `ChainReaderService`, located in `backend/src/verifier/chain-reader.service.ts`, acts as the read-only verification inspector. It queries NEAR RPC nodes using finalized blocks (`finality: 'final'`) to confirm on-chain ownership, verify account locks, and inspect transaction outcomes.

```
                  ┌───────────────────────┐
                  │      User Request     │
                  └───────────┬───────────┘
                              ▼
                  ┌───────────────────────┐
                  │    Verifier Module    │
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
   The service calls the Registry contract (`nivry.testnet`). It retrieves the true owner, active operator grants, and authority counter (`authority_epoch`). When a user signs a request, the backend verifies their signature and confirms that their identity matches `owner_id`.

3. **Keyless Treasury & Code Hash Verification (`verifyAccountLockState`):**
   A buyer needs mathematical proof that the agent creator cannot secretly drain the treasury. The service calls `view_access_key_list`. If the list is empty (`keys: []`), the account has zero access keys. Furthermore, it verifies that the treasury child account's deployed bytecode hash (`code_hash`) matches the registry's `wallet_code_hash()` view. Only when both zero access keys and matching immutable code are proven does it certify `locked_release`. Nobody holds a private key to that account, and only the verified smart contract code can move funds.

4. **Authority Epochs and Clean Transfers:**
   When an agent NFT transfers from Bob to Alice on the Registry contract:
   - The contract updates `owner_id` to Alice.
   - The contract increments `authority_epoch` (for example, from 1 to 2).
   - This increment instantly invalidates all previous operator permissions created by Bob.
   - The treasury account keeps its funds intact, but now accepts orders only from Alice.

5. **NEP-297 Standard Event Ingestion (`getFinalTransactionOutcome`):**
   When contracts execute payments, they emit standard log lines (`EVENT_JSON:...`). The verifier module extracts these logs and preserves their exact `(receipt_id, log_index)` order.

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

---

## 4. Passport Module (formerly Projection)

### What the Passport Module Does

On a blockchain, events occur as individual, low-level log lines: *"payment received"*, *"agent transferred"*, *"funds dispatched"*. 

These raw logs are like scattered receipts in a shoebox. A buyer or auditor cannot understand an agent's true history by reading raw blockchain receipts one by one. The Passport Module (`EventProjectionService` in `backend/src/passport/event-projection.service.ts`) gathers raw on-chain events and live contract state to produce the **Agent Passport**.

```
    [ Raw NEP-297 Blockchain Events ]  +  [ Live Chain Views ]
                    │                              │
                    └──────────────┬───────────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │    EventProjectionService    │
                    │       (Passport Engine)      │
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │        Agent Passport        │
                    │  - Identity & Owner          │
                    │  - Zero-Key Lock Proof       │
                    │  - History by Authority Epoch│
                    │  - Audited Financial Totals  │
                    └──────────────────────────────┘
```

### Key Responsibilities and How It Works

1. **Building the Agent Passport (`getAgentPassport`):**
   The Agent Passport functions like a comprehensive vehicle history report for an AI agent. It assembles current identity, proof of zero-key lock, and live spendable balances.

2. **History Grouped by Ownership Era (`history_by_epoch`):**
   Every time an agent transfers to a new owner, the blockchain increments the `authority_epoch`. The passport groups all past transactions and operations by epoch, cleanly isolating prior owners from current owners.

3. **Distinct Separation of Funds:**
   The service strictly categorizes incoming funds between `service_payment` (revenue earned by completing client tasks) and `owner_deposit` (operating budget provided by the owner).

4. **Safe On-Demand Ingestion (`ingestTransactionFromChain`):**
   When an on-chain transaction completes, clients call `POST /agents/:tokenId/ingest-tx` to immediately ingest event logs idempotently and update the passport.

### API Endpoints (`PassportController`)

- `GET /agents`: Returns a paginated list of all indexed agents.
- `GET /agents/:tokenId/passport`: Returns the complete Agent Passport with live verification and epoch history.
- `POST /agents/:tokenId/ingest-tx`: Ingests a finalized transaction hash to update local projections immediately.

---

## 5. Tasks Module

### What the Tasks Module Does

An AI agent's instructions (the **Bundle**) define what jobs it can do and what skills it has. 

When a client hires the agent to execute a task, the Tasks Module (`TaskRunnerService` in `backend/src/tasks/task-runner.service.ts`) serves as the **secure execution sandbox**. It enforces strict path restrictions, memory and file size limits, timeouts, and single-task concurrency so executing client tasks cannot compromise the server.

```
                  ┌────────────────────────┐
                  │   Client Task Request  │
                  └───────────┬────────────┘
                              ▼
                  ┌────────────────────────┐
                  │    TaskRunnerService   │
                  └───────────┬────────────┘
                              │
             Enforces 4 strict safety gates
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
1. Path Sandbox         2. Resource Limits     3. Single Concurrency
- Only fixtures/ dir    - Max 50 files         - 1 task per agent
- Rejects ".." / URLs   - Max 256 KB per file  - Rejects overlapping jobs
                              │
                              ▼
                  ┌────────────────────────┐
                  │  Deterministic Output  │
                  │  Markdown + SHA-256    │
                  └────────────────────────┘
```

### Core Architecture and Safety Controls

1. **Path Traversal Protection (`resolveAllowlistedFixtureDir`):**
   The service only allows agents to analyze directories inside the allowlisted `fixtures/` folder. It immediately rejects requests containing `../`, absolute paths (`/`), or URL schemes (`http://`).

2. **Hard Resource Limits:**
   - **File count limit:** The target directory cannot contain more than 50 files (`MAX_TASK_FILES`).
   - **File size limit:** No single file can exceed 256 KB (`MAX_TASK_FILE_BYTES`).
   - **Timeout guard:** Tasks abort automatically if execution exceeds 15 seconds (`DEFAULT_TASK_TIMEOUT_MS`).

3. **Single-Task Concurrency:**
   If an agent is already executing a job, the service rejects any new task for that same agent with a `409 Conflict`.

4. **Cryptographic Output Fingerprinting:**
   The service analyzes code files, detects exported functions, and compiles a structured Markdown documentation report. It calculates a SHA-256 digest (`output_sha256`) of the final report. This gives clients cryptographic proof of the exact output generated.

### API Endpoints (`TasksController`)

- `POST /tasks`: Submits and runs a task for a specified agent token.
- `GET /tasks/:taskId`: Returns the current status (`pending`, `running`, `completed`, `failed`, or `cancelled`) and result output.
- `POST /tasks/:taskId/cancel`: Cancels an active task.

---

## 6. Executor Module

### What the Executor Module Does

The Executor Module (`ExecutorService` in `backend/src/executor/executor.service.ts`) executes bounded on-chain payments from an agent's keyless treasury.

When an AI agent runs a job that incurs third-party costs or requires paying a vendor, the agent's operator dispatches payments. Rather than giving the AI agent arbitrary access to funds, the owner installs a bounded grant on the smart contract (`set_executor`). The Executor service validates all on-chain preconditions fail-closed and submits `execute_payment` to the registry contract using a local key signer.

```
          [ Payment Request ]
                   │
                   ▼
       ┌────────────────────────┐
       │     ExecutorService    │
       └───────────┬────────────┘
                   │
       1. Precondition checks:
          - Agent ready, not frozen, no pending operation
          - Not listed, no unresolved transfer call
          - Expected owner and authority epoch match
          - Recipient allowlisted & per-payment cap respected
          - Remaining budget >= requested amount
                   │
                   ▼
       ┌────────────────────────┐
       │   near-key-signer.ts   │  Signs execute_payment with EXECUTOR_PRIVATE_KEY
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │  nivry.testnet (NEAR)  │  Smart contract validates on-chain and transfers
       └───────────┬────────────┘
                   │
                   ▼
       ┌────────────────────────┐
       │ EventProjectionService │  Ingests finalized receipts into Agent Passport
       └────────────────────────┘
```

### Key Responsibilities and How It Works

1. **Fail-Closed Grant Precondition Checks:**
   Before broadcasting any transaction to NEAR, the service verifies that:
   - The token lifecycle is `ready`, `frozen` is false, and `pending_operation` is null.
   - The token is not listed for sale and has no unresolved `nft_transfer_call`.
   - The active grant's `executor_id` matches the configured executor account.
   - `authority_epoch` and `owner_at_grant` match the live on-chain owner.
   - The recipient is in `recipients`, and the amount does not exceed `per_payment_cap_yocto` or `remaining_budget_yocto`.

2. **Local Key Signer (`near-key-signer.ts`):**
   When `EXECUTOR_PRIVATE_KEY` is configured, payments are signed directly using `near-api-js` 7.5.3 and submitted to `execute_payment` on `nivry.testnet` with 150 TGas, waiting for final block inclusion (`waitUntil: 'FINAL'`).

3. **Instant Passport Re-projection:**
   Once the transaction finalizes on-chain, the executor calls `EventProjectionService.ingestTransactionFromChain` to parse NEP-297 events and update the local database projection immediately.

### API Endpoints (`ExecutorController`)

- `GET /executor/status`: Returns current mode (`local_key_signer`), executor account, and registry contract ID.
- `POST /executor/payments`: Dispatches a bounded treasury payment, returning transaction hash, contract arguments, and ingested events.

---

## 7. Session Module (Wallet Authentication)

### What the Session Module Does

The Session Module (`SessionService` in `backend/src/session/session.service.ts`) provides non-custodial, cryptographic challenge-response authentication for wallet owners and authorized executors.

The backend does not store wallet private keys. Instead, clients prove control of their NEAR account by signing an expiring cryptographic challenge. The backend validates the signature, verifies on-chain that the public key is an authorized access key, and issues an HMAC-signed bearer session token.

```
       [ Client Wallet ]                             [ Nivry Backend ]
               │                                             │
               │ 1. POST /auth/challenge { account_id }      │
               │────────────────────────────────────────────>│
               │                                             │ Generates nonce & challenge
               │ 2. Returns challenge_id, nonce, message     │ Stores in session_challenges
               │<────────────────────────────────────────────│
               │                                             │
      Signs with NEAR private key                            │
      (NEP-413 or raw message)                               │
               │                                             │
               │ 3. POST /auth/verify { sig, public_key }    │
               │────────────────────────────────────────────>│
               │                                             │ Verifies Ed25519 signature
               │                                             │ Checks NEAR RPC for access key
               │                                             │ Atomically consumes challenge
               │ 4. Returns session_token (Bearer)           │ Issues signed session token
               │<────────────────────────────────────────────│
               │                                             │
               │ 5. POST /tasks (with Bearer token)          │
               │────────────────────────────────────────────>│
                                                             │ Checks on-chain owner_id or
                                                             │ active executor grant for epoch
```

### Key Responsibilities and How It Works

1. **One-Use Expiring Challenges (`session_challenges` table):**
   `POST /auth/challenge` generates a unique challenge message containing a 32-byte hexadecimal nonce, target contract recipient (`nivry.testnet`), and timestamp. Challenges expire after 5 minutes and can only be consumed once.

2. **Dual-Format Ed25519 Verification:**
   `POST /auth/verify` parses the `ed25519:<base58>` public key and signature. It verifies the signature against either standard NEP-413 Borsh-serialized payloads or raw UTF-8 challenge messages using Node's native `node:crypto`.

3. **On-Chain Access Key Proof:**
   Possessing an Ed25519 private key is not enough—the public key must be installed on the NEAR account on-chain. `verifyAccountAccessKey` queries `view_access_key_list` and verifies the key has `FullAccess` or a `FunctionCall` permission targeting `nivry.testnet`.

4. **On-Chain Role-Based Authorization Guard (`SessionAuthGuard`):**
   Protected routes inspect the bearer token and invoke `assertAgentOwnerOrExecutor()`. The backend queries finalized `agent_info` on-chain:
   - For owner-only operations (e.g. updating bundles), caller must match `owner_id`.
   - For operational tasks (running tasks, canceling tasks, ingesting transactions), caller may match either `owner_id` or the active `executor_grant.executor_id` for the current `authority_epoch`.
   - As soon as the agent NFT transfers to a new owner, previous owners and their operators are instantly rejected on the very next call.

### API Endpoints (`SessionController`)

- `POST /auth/challenge`: Generates a single-use expiring challenge for a NEAR account.
- `POST /auth/verify`: Verifies the Ed25519 signature, checks on-chain key status, and returns a bearer session token.

