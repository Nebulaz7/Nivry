# Agent standards comparison: identity versus transferable treasury authority

Researched 2026-11-06. **Scope:** primary specifications, official NEAR proposals/discussions, and first-party ecosystem documentation/source. Public reads only; no paid APIs, authentication, registration, wallet actions, deployments, or live handoff tests. Follows the dated research-note convention in `docs/agent-nft-authority-research.md`.

**Evidence:** **Spec** = current specification text; **Code** = public implementation inspected, not deployed-bytecode verification; **Documented** = provider/project statement; **Recommendation** = proposed Nivry behavior, not an implemented guarantee. Statuses are retrieval-date snapshots, not claims of finality or adoption.

## Bottom line

- **ERC-8004 already covers transferable agent identity and persistent reputation/validation records.** Do not differentiate Nivry merely as “an agent NFT with history.” Its reserved `agentWallet` is a verified receiving-address binding, **cleared on transfer**, not a wallet whose signing authority transfers. Payments are explicitly outside the ERC's scope. [1,2]
- **ERC-6551 is the closest conceptual overlap:** a permanent NFT/account binding with holder-based authority and an address that need not change when the NFT is sold. Nivry would be a NEAR-native, agent-specific application/extension of that broad pattern, not the invention of NFT-controlled accounts. [3]
- **NEAR has relevant standards and ecosystem implementations, but this search did not establish an accepted NEP specifying Nivry's complete combination.** Native agent registries already exist; NEAR Accounts also documents NFT-controlled keyless accounts. Neither a directory nor an ecosystem contract is itself a NEP. [4–12]
- **Practical differentiation to prove:** the same treasury/address and payment ledger survive ownership changes, while the previous operator's *future* execution permissions are invalidated under explicit NEAR asynchronous handoff rules. This is a design target, not something ERC-8004 registration, NEP-171 compliance, or an NFT sale alone guarantees. [1,3,5,8,13]

## 1. ERC-8004, ERC-6551 and the Nivry target

| Dimension | ERC-8004: Trustless Agents | ERC-6551: NFT-bound accounts | Nivry target (proposed) |
| --- | --- | --- | --- |
| Current status | **Draft**, Standards Track/ERC in canonical frontmatter. Deployed implementations do not make it Final. [1,2] | **Review**, Standards Track/ERC in canonical frontmatter; not Final. [3] | Project design; no assigned/approved NEP established here. See `PLAN.md`. |
| Primary purpose | Agent discovery and interoperable trust signals. | NFTs controlling smart-contract accounts and assets. | Transferable economic authority over a NEAR agent treasury. |
| Identity | Transferable ERC-721 `agentId`; mutable URI resolves to a registration file with services/endpoints. [1] | Immutable `token()` binding to `(chainId, tokenContract, tokenId)`. Not an AI-agent directory. [3] | Stable `(network, NFT contract, token_id)` plus treasury binding and versioned agent manifest. |
| Wallet/address | Reserved `agentWallet`, initially owner's address; replace through wallet-control proof; cleared on NFT transfer. [1,2] | Deterministic account per implementation/salt/chain/token tuple; multiple accounts per NFT are permitted. [3] | Select one canonical treasury/address per agent, unchanged on owner transfer. |
| What ownership transfers | Registry identity and management rights—not the private keys, balances or authority of an arbitrary advertised wallet. [1,2] | Holder is a valid signer by default; reference account resolves current `ownerOf`. Implementations may add other signers or invalidate the holder. [3] | Buyer control, with old delegates invalidated and all recovery/admin exceptions disclosed. |
| History | Feedback and validations keyed to agent identity; transfer does not create a new agent ID. No specified transfer-triggered reputation reset. [1] | Stable account permits transaction continuity; no agent feedback or earnings schema. [3] | Payment events persist across owner epochs; distinguish payments, refunds, deposits, expenses and seeded activity. |
| Payments | Explicitly orthogonal; optional feedback payment proofs are not a payment rail. [1] | Account receives assets and executes operations; no service-payment accounting standard. [3] | `pay_agent` and receipt-linked accounting, plus a stated policy for direct transfers. |

### ERC-8004 behavior that matters in practice

**Spec:** Identity, Reputation and Validation are three separate registries. Registration advertises capabilities; it does not prove they work or are non-malicious. Identity is the registry namespace plus `agentId`, not simply the owner's wallet. Owners can transfer the NFT and delegate registry management. [1]

**Spec + Code:** `agentWallet` cannot be set through arbitrary metadata or registration metadata. `setAgentWallet` requires proof from the new receiving wallet using EIP-712/EOA signatures or ERC-1271 contract-wallet verification. Transfer clears it to an effective zero address, and the buyer must reverify a receiving wallet. The inspected implementation also allows owner-approved operators to set/unset it and clears it in `_update`. **Clearing this pointer neither moves funds nor revokes the old wallet's keys.** [1,2]

**Spec:** Reputation accepts signed fixed-point numeric feedback, optional tags/URIs/hashes, client revocation and appended responses. Current owner/approved-operator self-feedback is prohibited, but Sybil attacks remain possible. A `revenues` tag or optional `proofOfPayment` object is not independently verified revenue. Historical signals remain associated with the same agent; consumers should interpret changes of owner/runtime rather than treating bought reputation as the buyer's personal record. [1]

**Spec versus implementation maturity:** Validation defines owner/operator requests, responses from the requested validator (0–100), evidence commitments and query interfaces. Incentives/slashing are outside its scope. The team's repository explicitly warns that Validation is under active update/discussion with the TEE community; its listed deployment addresses cover Identity and Reputation. Do not present all three as equally finalized or independently verified live deployments. [1,2]

### ERC-6551 caveats—not just a wallet pointer

**Spec:** The permissionless, ownerless registry computes/creates deterministic EVM proxy accounts. The NFT binding is constant; a holder change does not require replacing that account. It layers around existing NFTs without modifying ERC-721. However, authorization is implementation-dependent, and the spec permits additional signers. It explicitly discusses seller draining before sale and ownership cycles; fraud prevention is outside its scope. **Permanent binding does not promise a funded treasury, exclusive buyer authority, immutable implementation behavior, or revoked external approvals.** [3]

## 2. Official NEAR standards and proposal search

The official index was read alongside individual documents; it does not include every unmerged proposal. GitHub issue/PR searches covered `agent`, `8004`, `6551`, `token-bound` and account extensions, supplemented by web searches of official sources. Hits included unrelated token/Linkdrop discussions, not an established full equivalent. **No matching accepted standard or dedicated draft was established by this bounded search; that is not proof none exists.** [4,14]

| Source / status observed | Relevant overlap and boundary |
| --- | --- |
| **NEP-171, Final**, with metadata/approval/enumeration/event extensions in the official index | NFT ownership/transfers and `nft_transfer_call` resolution; approvals clear on successful transfer. Does **not** specify an agent treasury, wallet-key rotation or earnings ledger. Its resolver may return the token, so treasury authority must account for rollback. [4,5] |
| **NEP-616, accepted/merged** | Deterministic account IDs from initialization code/state; useful account/factory infrastructure, not NFT ownership or agent-registry semantics. **Status mismatch:** file says `Approved`, index says `Final`; approval is not evidence of current network activation. [4,6] |
| **NEP-641, Final** | Contract-defined **off-chain** authorizations, including delegated/keyless wallets. Explicitly must not gate on-chain transactions because it cannot consume replay state. Full-access keys take precedence; contract-exclusive authority requires removing them. Not a token-bound account/agent standard. [7] |
| **NEP-393, Final** | Identity/reputation credential registry precedent, principally human-bound SBTs with constrained recovery/soul transfer—not freely saleable agent treasury title. [9] |
| **NEP-621, accepted** | FT vault shares, inspired by ERC-4626; not an NFT-owned wallet. File says `Approved`, index `Final`. “Vault” here should not be confused with Nivry's treasury or provider custody/recovery vaults. [4,10] |
| **Account extensions #478 / Account Namespaces PR #480** | Historical composable-account proposal. #478 is closed; #480 is closed, unmerged and labeled `S-retracted`. Neither establishes an adopted NFT-account equivalent. [11] |
| **Human-Bound Agent Credentials RFC, 2026-10-23** | Official governance forum, but an author's **Idea / request for comment**, not an accepted or numbered NEP. Proposes ZK human-backed agent credentials, scopes, quotas and revocation; not an NFT sale transferring a permanent treasury. The author says a draft NEP would follow interest. [12] |

**Recommendation:** If pursuing standardization, propose a small, separate Contract Standards extension depending on NEP-171 rather than changing every NFT's semantics. NEP-1 favors separate meaningful extensions and requires prior-proposal discussion/community review; a local spec is not “a NEAR standard.” [15]

## 3. NEAR-native implementations are already part of the landscape

These are ecosystem products/source projects, **not NEPs or proof of protocol-wide adoption**. Deployment claims below are first-party documentation unless labeled Code; no chain-state or handoff audit was performed.

| Implementation | Evidence and overlap | Boundary relative to Nivry |
| --- | --- | --- |
| **Near Neighbors Network (NNN)** | Documents a deployed native `nearneighbors.near` directory: wallet-linked agent cards, endpoints/capabilities, trusted lists, heartbeats and location attestations. [16] | Strong discovery/passport overlap. Inspected docs do not establish transferable NFT title controlling a permanent treasury or sale-time revocation. |
| **OrvynID** | Documents native `id.orvyn.near` identity records and `<handle>.id.orvyn.near` agent accounts, wallet mappings, status and signed track records. Also mirrors identities into ERC-8004 **on Base**. [17] | Direct identity/account/history overlap. Track record is computed from Orvyn's records and signed by Orvyn; registry status/upgrades remain Orvyn-controlled. Docs describe agent-key control, not NFT-owner treasury handoff. Base registration is not native NEAR ERC-8004 execution. |
| **Gork Agent Protocol** | **Code:** Rust `near_sdk` registry stores agents by `AccountId`; `register` uses `signer_account_id`; discovery, ratings, skills, endorsements and P2P-key registration/revocation exist. [18] | Concrete native registry implementation—not just an idea. Inspected module is account-centric, not a NEP-171 treasury-transfer mechanism. Repository deployment instructions/test claims were not independently verified. |
| **Consciousness Protocol / Volem client MCP** | Documents a NEAR agent registry/trust scores and state-hash publishing, with testnet identity example `consciousness-protocol.testnet`. [19] | Provenance/history overlap. Its work NFTs, IP licensing and royalty vaults are on **Story Protocol**, not evidence of NEAR NFT-controlled treasury transfer. |
| **NEAR Accounts / House of Stake** | Documents NEP-171 name tokens controlling keyless native accounts through registry → extension → wallet; owner records must agree. [8] | Closest native account-title precedent found. Accounts are **leased/reclaimable**; normal transfer sweeps supported NEAR/FT balances to the **outgoing** owner. NFTs/other contract assets are not automatically swept. This differs from selling an enduring, funded agent treasury. |

**Avoid stale conflation:** The former NEAR AI Developer Hub/framework repository is archived/deprecated and announces shutdown on 2025-10-31. Its `nearai registry` artifact tooling is not evidence of an active native NFT/treasury standard. An Agent Market job titled “Build: NEAR Agent Registry” is a discovery lead, not proof a deliverable exists; the retrieved job page exposed a login shell, not implementation evidence. [20,21]

**Aurora is a separate execution distinction:** Aurora documents an EVM-compatible environment (mainnet chain ID `1313161554`) using Ethereum tooling; it runs on NEAR infrastructure. Deploying ERC-8004/6551 there would still be **EVM contracts**, not native NEAR WASM/NEP-171 implementations. No specific Aurora deployment of either ERC was verified here. [22]

## 4. Practical positioning and design decisions

**Recommended description:** “Nivry proposes a NEAR-native agent NFT that controls a stable treasury and preserves payment history across ownership changes, with explicit operator revocation and handoff rules.” Avoid “first agent NFT,” “NEAR has no agent registry,” or “ERC-8004 transfers the agent wallet.” The broad pieces have clear precedent. [1,3,8,16–19]

1. **Resolve a current plan conflict.** `PLAN.md` §6 allows retiring the wallet and registering a fresh buyer wallet. That preserves a passport's continuity, **not a permanent treasury address**. Either keep the treasury canonical and swap only execution/provider adapters, or describe the fallback as wallet rebinding. This note does not change the plan.
2. **Distinguish a treasury ledger from an address.** A per-token balance inside one shared contract is a logical treasury, not a unique per-agent NEAR account. Choose which promise is required. Define binding immutability, storage funding, burn, account deletion and upgrade/recovery powers before calling it “permanent.” [3,5–8]
3. **Specify authority, not just metadata.** Separate token title, spend authority, operator credentials and provider administration. An owner epoch should invalidate stale grants/requests, including if the same owner later reacquires the NFT. Provider API credentials and already-issued signatures/approvals are separate authority paths; NFT transfer alone does not revoke them. See the companion [authority research](agent-nft-authority-research.md). [2,3,7]
4. **Make handoff safe on native NEAR.** Cross-contract calls/callbacks execute independently with no automatic global rollback. Define freeze/pending/final states, callback epoch checks, transfer-call return behavior, settlement failures and in-flight execution. Do not equate “one user transaction” with atomic completion across NFT, treasury and an off-chain wallet provider. [5,13]
5. **Sell verified accounting, not unquestioned reputation.** Index payments to stable identity **and owner/runtime epoch**, preserving old history without attributing old performance to a new operator. Record receipt outcomes, token units, refunds and fees; direct native transfers do not invoke contract code. Payment volume alone cannot establish genuine customers or exclude wash payments. [1,6,13]
6. **Compose rather than replace discovery.** Publish endpoints/manifest and canonical treasury references to existing native directories; optionally mirror discovery to ERC-8004. Any EVM mirror needs an explicit synchronization/control model—NEAR ownership does not automatically update an ERC-721 on Base/Aurora. Orvyn demonstrates cross-linking, not automatic cross-chain authority equivalence. [1,17,22]

## Sources and search limitations

All sources below were retrieved/read on the research date. Branch URLs and web documentation can change. Specifications establish intended interfaces, not audited deployed behavior; first-party product claims are not independent confirmation. No claim of originality or exhaustive absence follows from this search.

1. [Canonical ERC-8004 source/frontmatter](https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-8004.md) — Draft status; Identity, Reputation, Validation, `agentWallet`, payments and security.
2. [8004 team contracts/docs](https://github.com/erc-8004/erc-8004-contracts); [Identity implementation](https://raw.githubusercontent.com/erc-8004/erc-8004-contracts/master/contracts/IdentityRegistryUpgradeable.sol) — wallet clearing/proof/approved operators; deployment listings and Validation warning.
3. [Canonical ERC-6551 source/frontmatter](https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-6551.md) — Review status, binding/registry/account interfaces, reference authorization and sale/cycle risks.
4. [Official NEPs index](https://github.com/near/NEPs) — published standards and statuses.
5. [NEP-171](https://github.com/near/NEPs/blob/master/neps/nep-0171.md) — transfer/transfer-call, approvals, resolver and events.
6. [NEP-616](https://github.com/near/NEPs/blob/master/neps/nep-0616.md); [merged PR #616](https://github.com/near/NEPs/pull/616) — deterministic accounts, permissions and native-transfer notification limitation.
7. [NEP-641](https://github.com/near/NEPs/blob/master/neps/nep-0641.md) — off-chain authorization, key precedence, replay boundary.
8. [NEAR Accounts technical overview](https://docs.nearaccounts.com/docs/architecture/) — keyless NFT-controlled accounts, transfers/sweeps, leases and recovery.
9. [NEP-393](https://github.com/near/NEPs/blob/master/neps/nep-0393.md) — SBT registry/recovery, human binding and restricted transfer.
10. [NEP-621](https://github.com/near/NEPs/blob/master/neps/nep-0621.md) — FT tokenized vault shares.
11. [Account extensions #478](https://github.com/near/NEPs/issues/478); [retracted Account Namespaces PR #480](https://github.com/near/NEPs/pull/480).
12. [Human-Bound Agent Credentials RFC](https://gov.near.org/t/rfc-human-bound-agent-credentials-zk-verified-human-agent-of-a-verified-human-ids-on-near/42715) — author proposal and full text, not adopted standard.
13. [Official NEAR cross-contract documentation](https://docs.near.org/smart-contracts/anatomy/crosscontract) — asynchronous, independent receipts and explicit failure handling.
14. Official repository search: [agent](https://github.com/near/NEPs/issues?q=agent), [8004](https://github.com/near/NEPs/issues?q=8004), [6551](https://github.com/near/NEPs/issues?q=6551), [token-bound](https://github.com/near/NEPs/issues?q=token-bound). Public GitHub Search API results were also read; lexical hits can include comments/unrelated references and are not a complete code/discussion search.
15. [NEP-1](https://github.com/near/NEPs/blob/master/neps/nep-0001.md) — proposal process and separate-extension guidance; prefer it over older lifecycle prose in the README.
16. NNN first-party [project/contract description](https://nearneighbors.com/capital) and [registration documentation](https://nearneighbors.com/docs/how-to-register) — native directory and account-linked cards. Registration instructions read as evidence only, not executed.
17. [OrvynID](https://docs.orvyn.cash/orvyn-id); [Base ERC-8004 mirroring](https://docs.orvyn.cash/orvyn-id/erc-8004) — NEAR identity/account model, signed track record and distinct EVM registration.
18. [Gork repository](https://github.com/Kampouse/gork-protocol); [native registry source](https://raw.githubusercontent.com/Kampouse/gork-protocol/main/contracts/registry/src/lib.rs) — inspected registration/discovery/ratings/key functions, not run/audited.
19. [Consciousness Protocol MCP](https://github.com/chiti-agent/consciousness-protocol-mcp) — documented NEAR identity/provenance versus Story NFTs/royalties.
20. [Archived NEAR AI framework](https://github.com/nearai/nearai) — deprecation/shutdown notice and former artifact registry.
21. [Agent Market registry job lead](https://market.near.ai/jobs/0dbbaa73-1b7b-4f21-a3c3-8a4127712743) — search title only; page content insufficient to verify a build.
22. [Official Aurora documentation](https://doc.aurora.dev/); [Aurora EVM architecture](https://help.aurora.dev/article/20-aurora-evm) — EVM tooling/network versus NEAR-native execution.

**Retrieval limits:** Initial `eips.ethereum.org/EIPS/eip-8004` and `eip-6551` fetches failed; canonical `ethereum/ERCs` raw specifications were successfully read instead, including status frontmatter. The older NEAR Aurora guide appeared in search but returned 404 on direct fetch; Aurora's own docs were read instead. NNN's interactive registry page exposed little static content, so its first-party explanatory pages support the claims—not an inspected registry implementation. Web indexing may miss repositories, private/unindexed proposals, forum threads or recent revisions. No full GitHub code census, deployment inventory, runtime audit, provider revocation test, or paid endpoint access was performed. Background-agent delegation was unavailable in this session; research was performed directly with parallel public-source reads.
