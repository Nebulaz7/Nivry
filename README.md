# Nivry

A proposed NEAR-native agent NFT with a stable keyless treasury, on-chain spending constraints, and operator revocation when ownership changes.

**Status:** planning; implementation and testnet validation are not complete. Nothing in this repository currently establishes a working or audited custody system.

## Start here

- [`PLAN.md`](PLAN.md) — selected architecture, contract interfaces, safety rules, scope and seven-day delivery plan.
- [`HACKATHON.md`](HACKATHON.md) — supplied hackathon rules; recheck the live rules before submission.
- [`docs/agent-standards-comparison.md`](docs/agent-standards-comparison.md) — ERC-8004 / ERC-6551 comparison and related NEAR work.
- [`docs/agent-nft-authority-research.md`](docs/agent-nft-authority-research.md) — wallet control, revocation and provider limitations.
- [`docs/tee-executor-feasibility.md`](docs/tee-executor-feasibility.md) — optional OutLayer testnet executor integration and unverified operational gates.

## Selected design

- **Native NEAR testnet**, with Rust contracts.
- **Next.js** frontend and **NestJS** backend.
- One actual **keyless treasury account per NFT**; its address and remaining funds persist through sale.
- An immutable registry enforces NFT ownership, revocable executor permissions and fixed-price sales.
- No owner can install treasury access keys, replace control code or create transfer-surviving delegates through the planned interface.
- Optional **OutLayer TEE custody for replaceable executor keys**, not a master key on the treasury.
- One Hermes task adapter; a public sanitized configuration bundle is not proof of runtime execution.

The broad patterns have precedent. Nivry is not claiming to invent agent NFTs or NFT-bound accounts. Its implementation target is safe, explicit NEAR-native economic handover, not a generic identity registry.

## Before a submission-ready release

Replace this planning overview with tested clean-clone instructions, deployed testnet addresses and code/key verification, actual validation results, reuse disclosures, known limitations and the demo. No run commands or deployment addresses are published yet because implementation has not been performed.

Testnet native NEAR only. No production-security, complete marketplace compatibility, accepted-NEP, genuine-revenue or independently attested-runtime claims are made.
