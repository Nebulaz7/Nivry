---
NEP: 0000
Title: Agent Title Extension for Non-Fungible Tokens
Authors: [TODO: your name and GitHub handle]
Status: Draft
DiscussionsTo: [TODO: link to your GitHub Discussion in near/NEPs]
Type: Standards Track
Category: Contract
Version: 1.0.0
Created: 10-Nov-2026
Requires: 171, 297
---

> Before opening the PR: copy the exact header format from `nep-0000-template.md` and NEP-171 (this block follows NEP-171's field names, but check it). Rename this file to `neps/nep-<PR number padded to 4 digits>.md` once the PR exists, and delete this note.

## Summary

This NEP extends NEP-171 so that a non-fungible token can act as the **title** of an autonomous AI agent. The token owner is the party in control of the agent. The extension adds three things on top of an ordinary NFT: a binding between the token and the agent's wallet, a monotonic owner epoch that changes on every transfer so that off-chain runtimes and custodians can tell when control has moved, and a hash-based record of the agent's code and skills (its "genome") that changes visibly when the agent is modified. It also defines events, following NEP-297, so that indexers can build a verifiable history of an agent: owners, genome versions and payments received.

Tokens that implement this extension remain valid NEP-171 tokens. Existing wallets and marketplaces keep working without changes.

## Motivation

AI agents can now hold funds, sign transactions and earn money. Unlike a JPEG, what makes an agent valuable is not the copyable software but the economic identity attached to it: the wallet, the payment history and the permissions it has accumulated. Today there is no standard way on NEAR to represent that identity as a tradeable asset.

NEP-171 gives ownership and transfer, and NEP-177 gives display metadata, but neither defines:

1. how a token is bound to a wallet that an agent uses to act,
2. what must happen to that binding when the token is sold,
3. how a buyer can verify that the agent was not changed or reassigned right before the sale, or
4. how a service can check that a request comes from the agent's current owner and not a previous one.

Without these, every project invents its own agent-ownership scheme, marketplaces cannot show comparable information, and custody providers and agent services have no common way to ask "who controls this agent right now?". A small shared interface solves this without replacing NEP-171.

Use cases:

- Selling or renting an agent together with its wallet and track record.
- Custody providers and agent marketplaces gating signing or job assignment on the on-chain owner of the title.
- Buyers inspecting an agent's ownership and genome history before purchasing.

Related work in other ecosystems includes BAP-578 (BNB Chain) and ERC-7857 (a draft Ethereum standard). This NEP does not copy either. It is a NEAR-native extension of NEP-171 and focuses on ownership and control transfer. Memory privacy and encrypted-metadata transfer are out of scope (see Future possibilities).

## Specification

The key words MUST, MUST NOT, SHOULD, and MAY are as in RFC 2119.

A contract implementing this NEP MUST implement NEP-171 and MUST emit events following NEP-297. It MUST NOT change the behavior or return values of any NEP-171 method, except for the side effects on agent state specified in "Transfer rules".

### Data types

```rust
/// A reference to the wallet an agent uses to act. The standard does not
/// define how the wallet works. It only records which wallet is bound.
pub struct AgentWallet {
    /// Free-form identifier of the custody system or runtime, e.g. "outlayer".
    pub provider: String,
    /// Address or account id of the bound wallet.
    pub address: String,
}

pub enum BindingState {
    /// No wallet is bound. Services MUST treat the agent as unable to act.
    Unbound,
    /// A wallet is bound for the current owner epoch.
    Bound,
    /// The previous binding was revoked by a transfer and not yet replaced.
    Revoked,
}

pub struct AgentRecord {
    pub token_id: String,
    pub wallet: Option<AgentWallet>,
    pub binding_state: BindingState,
    /// Starts at 0 on mint. Increases by at least 1 on every ownership change.
    /// Never decreases.
    pub owner_epoch: u64,
    /// Lowercase hex SHA-256 (64 chars) of the agent genome bundle, or None.
    pub genome_hash: Option<String>,
    /// Starts at 0. Increases by 1 each time genome_hash changes.
    pub genome_version: u32,
    /// Owner-set pause flag. Services SHOULD NOT act for a paused agent.
    pub paused: bool,
    /// Total native NEAR received through agent_pay, in yoctoNEAR.
    pub received_yocto: U128,
}
```

### Methods

```rust
pub trait AgentTitle {
    /// Mint a token with an agent record. MAY be restricted by the contract.
    /// Emits `agent_minted`.
    fn agent_mint(
        &mut self,
        token_id: TokenId,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
        genome_hash: Option<String>,
    ) -> Token;

    /// View. Returns the record for a token, or None if the token has none.
    fn agent_record(&self, token_id: TokenId) -> Option<AgentRecord>;

    /// View. True iff `account_id` is the current owner of the token and the
    /// agent is not paused. Custodians and services call this before acting.
    fn agent_is_controller(&self, token_id: TokenId, account_id: AccountId) -> bool;

    /// Owner only. Bind a wallet to the token for the current owner epoch.
    /// Sets binding_state to Bound. Emits `agent_wallet_bound`.
    fn agent_bind_wallet(&mut self, token_id: TokenId, wallet: AgentWallet);

    /// Owner only. Set the genome hash. If it differs from the current value,
    /// increases genome_version by 1. Emits `agent_genome_updated`.
    fn agent_update_genome(&mut self, token_id: TokenId, genome_hash: String);

    /// Owner only. Emits `agent_paused`.
    fn agent_set_paused(&mut self, token_id: TokenId, paused: bool);

    /// Payable. Credits native NEAR attached to the call to the agent record.
    /// The contract MUST NOT send the funds anywhere. How funds reach the bound
    /// wallet is defined by the implementation. Emits `agent_paid`.
    fn agent_pay(&mut self, token_id: TokenId);
}
```

### Transfer rules

When ownership of a token with an agent record changes through `nft_transfer`, `nft_transfer_call`, or any approval-based transfer defined by NEP-178, the contract MUST in the same state change:

1. increase `owner_epoch` by at least 1,
2. set `binding_state` to `Revoked` if it was `Bound`, and keep the old wallet value for audit purposes only, and
3. emit `agent_owner_changed`.

If `nft_transfer_call` is resolved by a rollback that returns the token to the previous owner, the contract MUST increase `owner_epoch` again and MUST NOT restore the `Bound` state. The previous owner has to bind a wallet again. `owner_epoch` is strictly monotonic.

The new owner makes the agent operational again by calling `agent_bind_wallet`.

Custodians and services that act on behalf of an agent MUST check, for every action that moves value or signs data, that `agent_is_controller` returns true for the requesting account, that `binding_state` is `Bound`, and that the wallet in the record matches the wallet being used. They SHOULD store the `owner_epoch` they last saw and refuse requests tied to an older epoch.

### Events

All events use the NEP-297 envelope with `standard` set to `"agent_title"` and `version` set to `"1.0.0"`.

| event | data |
| --- | --- |
| `agent_minted` | `{ token_id, owner_id, genome_hash? }` |
| `agent_owner_changed` | `{ token_id, old_owner_id, new_owner_id, owner_epoch }` |
| `agent_wallet_bound` | `{ token_id, owner_epoch, provider, address }` |
| `agent_genome_updated` | `{ token_id, old_hash?, new_hash, genome_version }` |
| `agent_paused` | `{ token_id, paused }` |
| `agent_paid` | `{ token_id, payer_id, amount_yocto }` |

Example:

```json
EVENT_JSON:{"standard":"agent_title","version":"1.0.0","event":"agent_owner_changed","data":[{"token_id":"7","old_owner_id":"alice.near","new_owner_id":"bob.near","owner_epoch":3}]}
```

### Agent history ("passport")

Indexers MAY derive an agent's history from these events: the list of owners with epochs, genome versions with hashes, and payments received with payer ids. This NEP does not define an indexer API.

### Marketplace guidance (non-normative)

Marketplaces SHOULD read `genome_version` and `owner_epoch` when a token is listed and again at purchase time, and SHOULD abort the sale if either value changed since listing. This protects buyers from last-minute modification of the agent.

## Reference Implementation

A Rust reference implementation built with `near-sdk`, with tests covering the transfer rules, will be linked here: [TODO: public repo URL, commit hash and testnet contract id].

The reference implementation also includes a CLI that packs an agent's skills into a genome bundle, hashes it and mints the token, plus a minimal sale contract. These parts are not part of the standard.

## Security Implications

1. **Off-chain enforcement is a trust assumption.** A contract cannot stop an off-chain runtime or custodian from ignoring the revoked binding. The standard only gives them an authoritative on-chain signal. Services that act for an agent must read it on every sensitive action. A custodian that caches ownership can let a previous owner act after a sale.
2. **Copies cannot be revoked.** The previous owner may keep a copy of the agent's prompts, skills and data. Revocation removes the copy's access to the wallet, title and history, not its code. Implementations and marketplaces SHOULD NOT claim otherwise.
3. **Last-minute modification.** An owner could change the genome or wallet binding just before a sale. Marketplace guidance above (re-check version and epoch at purchase) mitigates this. A contract MAY also reject `agent_update_genome` while approvals exist for the token.
4. **Rollback behavior.** `nft_transfer_call` can resolve with a rollback. Treating a rolled-back transfer as an ownership event (epoch increases, binding stays revoked) is deliberate: it removes any window in which a custodian could see an old, valid binding after control briefly moved.
5. **Reputation washing.** Anyone can call `agent_pay`, so `received_yocto` can be inflated by the owner paying their own agent. The `agent_paid` event includes the payer so indexers and buyers can discount payments from the owner or related accounts. The total is a self-reported figure and not proof of organic demand.
6. **Storage and spam.** Agent records and events consume storage that the contract must account for under NEAR's storage staking model. Implementations SHOULD require a minimum deposit for `agent_pay` and SHOULD charge minters for storage.
7. **No secrets on-chain.** `genome_hash` is a hash. Contracts and tools MUST NOT store prompts, keys or memory on-chain.
8. **Custody provider risk.** The wallet's security depends on the custody provider. Attestation or hardware claims are the provider's, not this standard's. Documentation SHOULD name the provider and not describe the system as trustless.

## Alternatives

- **Stand-alone agent standard (no NEP-171).** Rejected. Wallets, explorers and marketplaces would not recognize the tokens, and ownership and approvals would have to be rebuilt.
- **Put agent state inside NEP-177 metadata.** Rejected. NEP-177 metadata is descriptive and loosely typed. Control semantics need specified methods and events.
- **Hold the wallet's keys inside the NFT contract.** Rejected. A contract cannot keep private keys. Control must be enforced by a custodian reading on-chain state.
- **Derive the owner epoch from the transfer event log alone.** Rejected. Custodians need a cheap view call, not event replay.
- **Do nothing and let each project define its own scheme.** Leads to incompatible implementations and no shared marketplace behavior.

## Future possibilities

- Encrypted memory or skills that move to a new owner with the token, using a TEE or zero-knowledge proof (related to ERC-7857).
- A standard commitment (Merkle root) for the agent's interaction history, as in BAP-578.
- A standard sale-listing interface with expected-version checks built in.
- Rental or time-limited authorization of an operator account without a transfer.
- Multi-token payment accounting (NEP-141 and NEP-245).

## Consequences

### Positive

- Agents can be sold with their identity and history, with an on-chain signal that control has changed.
- Custodians and agent services can use one common check, `agent_is_controller`.
- Existing NFT tooling keeps working.

### Neutral

- Contracts store a small extra record per token.
- Indexers need to understand a new event standard to show agent history.

### Negative

- Revocation is only as strong as custodians' willingness to honor it. See Security Implications.
- Bumping the epoch on rolled-back transfers makes some failed transfers more costly for the previous owner, who must rebind.

### Backwards Compatibility

This extension adds methods and events and does not change NEP-171 behavior. Existing NEP-171 contracts are unaffected. Tokens minted without an agent record behave as ordinary NFTs, and `agent_record` returns `None`. Existing NFT contracts cannot adopt the extension for already-minted tokens without a migration that creates records for them.

## Unresolved Issues

- Whether the binding should be allowed to carry over across a transfer when the same custody provider supports handing a wallet to a new owner. This draft revokes by default for safety.
- The exact approach for wallets that are NEAR accounts and wallets on other chains reached through Chain Signatures.
- Whether `agent_is_controller` should also support an owner-approved operator account.
- Final names for the event standard and methods.

## Changelog

Leave blank for the initial draft.

## Copyright

Copyright and related rights waived via [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
