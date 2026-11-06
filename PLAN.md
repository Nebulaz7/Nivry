# Nivry: Build Plan (draft v0.2)

Formerly "Project X". Changes from v0.1: renamed to Nivry, Hermes replaces OpenClaw as the demo runtime, Agent Market dropped for now (earnings come from our own contract), OutLayer findings folded in, spikes rewritten.

**Hackathon:** NEAR HACKATHON, track `nfts` (NFTs That Do Something). Also consider tagging `agents` and `security` if they genuinely fit.
**Hard deadline:** Sat 14 Nov 2026, 23:59 UTC. **Target submit:** Fri 13 Nov.
**Team:** Nebulaz (blockchain + frontend redesign), Dev B (backend + a first pass of frontend).
**Defaults (change if you disagree):** Rust contracts, TypeScript CLI and frontend, Hermes Agent as the demo runtime.
**Name checks still to do:** domains, GitHub org, X handle, claim `nivry` on npm (it was unclaimed on 6 Nov).

---

## 1. One-liner

An NFT that is the ownership papers of an AI agent. Whoever holds the NFT controls the agent's wallet, its earnings history and its permissions. Sell the NFT and control moves to the buyer in one step. The old operator's runtime can no longer act.

The brain (model and prompts) is swappable. What the NFT owns is the agent as an economic entity: wallet, track record, permissions.

## 2. Pieces (working view, not final architecture)

| Piece | What it is | Who provides it |
|---|---|---|
| Brain | Hermes Agent, run in Docker | Existing |
| Wallet | Holds funds, enforces spend policy, signs inside a TEE | OutLayer custody (sponsor, has testnet) |
| Title | NEP-171 token plus agent extension: binding, passport, transfer rules | **We build** |
| Earnings | `pay_agent` call: anyone can hire or pay an agent, logged in the passport | **We build** (in the NFA contract) |
| Sale market | List and buy the NFT | **We build a small one** |
| Tooling | SKILL.md plus an npx CLI that packs and mints the agent | **We build** |
| Frontend | Passport page, list, buy, earnings history | **We build** |

Design rule: control transfer lives inside our NFT contract's transfer logic, not in our marketplace, so it works on any marketplace.

Agent Market (market.near.ai) is out of scope for now. It can come back later as a bonus integration.

## 3. Demo story (this is also the acceptance test)

1. User tells their Hermes agent "mint yourself on NEAR" (or runs `npx nivry mint`). One approval in the owner's wallet.
2. Agent appears with a passport: NFT id, wallet address, genome hash, owner epoch, earnings.
3. A second account pays or hires the agent through `pay_agent`. Earnings show in the passport.
4. Owner lists the NFT. A buyer buys it. One transaction: payment, ownership, wallet rebind, owner epoch bump.
5. Old operator's instance tries to act and fails. New owner's instance works.
6. Passport shows: 2 owners, same genome version, earnings history intact.

If this runs from a clean clone on testnet, we have a real submission.

## 4. Scope

**Must have**
- NEP-171 contract with agent extension (binding, passport fields, `pay_agent`, events)
- Atomic sale with authority revocation, with tests
- Mint CLI plus SKILL.md for Hermes
- Sale market contract (list, buy)
- Frontend: passport, list, buy
- README written as "do X, see Y" steps

**Should have**
- Spend limits and freeze surfaced in the UI
- Versioned passport (genome changes shown in history)
- Draft NEP spec in repo plus governance forum post

**Cut first if behind (in this order)**
1. Second runtime adapter
2. Treasury-funded inference gateway
3. Memory tier UI
4. Draft NEP PR (keep the forum post)
5. Hosted frontend (local demo is allowed, hosted is a plus)

## 4b. Decided limits (be honest in README)

- We revoke authority on sale, we do not un-copy the agent. A seller can keep a copy of the skills and prompts. That copy has no wallet, no reputation and no passport.
- "Attested" means attested by the TEE provider. Do not claim unhackable.
- Demand for agent NFTs is unproven. We price by verifiable earnings.
- Earnings from our own accounts must be labeled as seeded, not organic.
- OutLayer is a third-party service. Say so in the README.

## 5. Hermes packing rules

Hermes state lives in one directory, `~/.hermes`, mounted at `/opt/data` in the official Docker image (`nousresearch/hermes-agent`).

- **Pack (the genome):** `skills/`, `SOUL.md`, `config.yaml` with secrets stripped.
- **Never pack:** `.env`, `memories/`, `sessions/`, `state.db`. These hold the seller's keys and private data.
- Hash the genome for the passport. Hermes rewrites its own skills, so the hash will change. Treat each change as a new version in the passport history.
- On Windows, Docker Desktop bind mounts can corrupt the SQLite database. Use a named Docker volume or WSL2.
- Backup and restore is not documented. Stop the container and copy the directory, then verify the restored agent works (untested).

## 6. Spikes (decide by end of Fri 6 Nov)

| # | Question | Pass | Fail, fall back to |
|---|---|---|---|
| 1 | Ask OutLayer (NEAR Discord): can a wallet's controller be a contract? Can control of an existing wallet be handed to a new owner? Can the API key be rotated? | Sale moves wallet control directly | **Default design:** on sale, freeze or retire the old wallet, buyer registers a fresh wallet, the contract rebinds it in the passport |
| 2 | OutLayer testnet end to end: register, set policy, sign a NEP-413 message, freeze | Full testnet demo | Tiny mainnet amounts, labeled |
| 3 | Can policy be set through the SDK or API (`policy.*`), not only the dashboard? | Automatable mint flow | Mint flow has one manual dashboard step |
| 4 | Hermes in Docker: run headless, load a test skill, pack the genome, restore on another machine | Adapter works | Fixed demo image with the agent pre-baked |
| 5 | Does the SDK method for freeze exist, or is it dashboard or on-chain only? | Freeze scriptable on sale | Retire the wallet by sweeping funds and dropping the key |
| 6 | NFT contract `pay_agent` plus passport event reading from testnet | Passport reads chain | Passport reads our own indexer, labeled |

Known from research: testnet custody supports register, addresses, balances, policy, signing and NEAR calls. Swaps and Intents withdrawals are mainnet-only. Vault parent changes only through a one-way recovery, so vaults are not a sale-transfer mechanism. Account binding keeps the owner in control and lets them revoke by removing the executor.

Record every answer in `docs/spikes.md` with date and evidence.

## 7. Work split

**Nebulaz**
- Rust contracts: NFT with agent extension, `pay_agent`, sale market, tests
- Spec in `docs/spec.md` (NEP template sections)
- Frontend redesign and demo video
- Spike 1 (ask OutLayer), 3, 5

**Dev B**
- OutLayer client wrapper (SDK)
- CLI: `init`, `pack`, `mint`, `list`, `buy`, `status`, `rotate`
- Hermes adapter and genome packing
- Passport reader
- First-pass frontend scaffold (Nebulaz redesigns it later)
- Spikes 2, 4

**Shared**
- Spike 6
- SKILL.md
- README and demo script

## 8. Schedule

| Date | Goal |
|---|---|
| Fri 6 Nov | Spikes done, decision recorded. Repo created. Bare NEP-171 on testnet. CLI skeleton. Names claimed |
| Sat 7 Nov | Manifest format and spec locked. Agent binding, passport and `pay_agent` in contract. Wallet client working. Governance forum post |
| Sun 8 Nov | Atomic sale plus revocation with tests. Sale market list and buy. CLI `pack` and `mint` |
| Mon 9 Nov | SKILL.md plus CLI end to end with Hermes. Passport reader |
| Tue 10 Nov | Frontend: passport, list, buy, history. Redesign pass |
| Wed 11 Nov | Full demo from a clean clone. README. Draft NEP PR only if the demo is green |
| Thu 12 Nov | Polish, record video, draft X post, host frontend |
| Fri 13 Nov | Fixes only. Make repo public. **Submit** |
| Sat 14 Nov | Buffer. Deadline 23:59 UTC |

If a spike fails, we decide the same day. We do not carry unknowns past Fri 6 Nov.

## 9. Suggested repo layout

```
nivry/
  contracts/
    nfa/            # NEP-171 + agent extension + pay_agent
    market/         # list and buy
  cli/              # npx tool
  skill/            # SKILL.md + references
  web/              # frontend
  docs/
    spec.md         # NEP-style spec
    spikes.md       # results with evidence
    demo-script.md  # the 6-step story
  LICENSE
  README.md
```

## 10. Hackathon rules to respect

- Repo must be public before the deadline, with a LICENSE file.
- README: what it is, the problem, and "do X, see Y" steps. No marketing. An AI screener runs it first.
- Demo post on X: says it was built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, attaches the video. First line states the user problem. Show one complete moment. Say what NEAR does concretely.
- Submit once per repository. Mistakes are fixed through the request-changes page, not by resubmitting.
- Need a mainnet NEAR account for the prize payout, created before Fri 13 Nov.
- Intents has no testnet. Keep the core demo testnet and NEAR-native.
- Code before 1 Nov: only work from the 19 Oct announcement counts, older code is baseline. Use a dedicated branch or tags, and disclose reuse in the README.
- Never commit secrets. No agent or script signs, deploys to mainnet, pushes or submits without a human yes.
- A local demo is fine if the repo is public and the video is clear. Screenshots alone are not enough.

## 11. NEP track (parallel, time-boxed)

- Write `docs/spec.md` in NEP format (summary, motivation, specification, rationale, drawbacks).
- Post the idea on the NEAR governance forum by Sat 7 Nov.
- Open a Draft NEP PR around Wed 11 Nov only if the demo is working. The NEP number comes from the PR number.
- Say "proposed NEP, in review". Never say accepted.

## 12. Risks

- OutLayer cannot hand a wallet to a new owner. Mitigation: the rebind fallback.
- OutLayer testnet behaves differently than documented.
- Hermes self-edits its skills, so the genome hash changes often. Mitigation: versioned passport.
- No external demand without Agent Market. Mitigation: `pay_agent` plus honestly labeled seeded earnings.
- Two people, one week. Scope creep is the main danger.
- Wash trading: earnings paid by our own accounts look fake. Label them.

## 13. Open questions (architecture, discuss later)

- Contract-held balance vs sub-account per agent
- Where the genome bundle lives (storage and encryption)
- Whether the sale market takes a fee
- Whether we add the treasury-funded inference gateway
- Whether to bring Agent Market back as a bonus integration
- Hosted guardian vs OutLayer-only (Shade Agent is the plan B if OutLayer does not fit)

## 14. Submission checklist

- [ ] Repo public, LICENSE present
- [ ] README with do-X-see-Y steps, tested from a clean clone
- [ ] Testnet contract addresses in README
- [ ] Reuse disclosure in README (if any)
- [ ] Demo video recorded
- [ ] X post published with @NEARProtocol and #NEARHackathon
- [ ] Mainnet payout account ready
- [ ] Payload confirmed by the team lead, then submitted once
- [ ] Hosted demo kept up until at least 18 Nov
