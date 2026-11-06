//! Nivry agent NFT registry: title, keyless-treasury factory, authority epochs
//! and bounded execution grants (PLAN.md §4, §5, §7, §8, §9).
//!
//! The registry is the single source of truth for agent ownership. It is the only
//! account allowed to dispatch value out of a treasury, and it re-reads ownership
//! on every authority decision rather than trusting a cached owner.
//!
//! Day-1 scope: provisioning, funding, transfer, executor grants and a bounded
//! payout. Listing/purchase (`list_agent`, `buy_agent`), seller credits and
//! `nft_transfer_call` are later days and are deliberately absent rather than
//! stubbed with a fake success path.
//!
//! Layout: `manifest` holds the fixed bundle schema and `state` the authoritative
//! agent record. All exported methods live in this file because near-sdk 5.30's
//! `#[near]` macro emits an ext-contract trait that only resolves in the module
//! where the state struct is defined.

mod manifest;
mod state;

pub use manifest::Manifest;
pub use state::{
    AgentInfo, AgentRecord, ExecutorGrant, GrantView, Lifecycle, OperationKind, PendingOperation,
    PendingOperationView,
};

use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, TokenMetadata};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::borsh::BorshSerialize;
use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, Promise, PromiseOrValue,
};

/// Deployed treasury code, pinned into this factory at build time.
///
/// Built by `scripts/build-contracts.sh`. The byte hash is published by
/// `wallet_code_hash()` and must be recorded before any claim of immutability.
pub const AGENT_WALLET_WASM: &[u8] = include_bytes!("../res/agent_wallet.wasm");

/// NEP-171 requires a 1 yoctoNEAR security deposit on transfer calls.
pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
pub const ZERO_YOCTO: NearToken = NearToken::from_yoctonear(0);

/// Native balance handed to a freshly created treasury.
pub const WALLET_INITIAL_BALANCE: NearToken = NearToken::from_millinear(50);

/// Retained by the registry to pay for the agent record's own storage.
pub const REGISTRY_STORAGE_ALLOWANCE_YOCTO: u128 = 30_000_000_000_000_000_000_000;

pub const CREATE_AGENT_GAS: Gas = Gas::from_tgas(60);
pub const DISPATCH_GAS: Gas = Gas::from_tgas(40);
pub const SETTLE_GAS: Gas = Gas::from_tgas(25);

pub const MAX_RECIPIENTS: usize = 8;
pub const MAX_CALLBACK_RESULT_BYTES: usize = 256;

/// A grant may never outlive this horizon, regardless of what a client asks for.
pub const MAX_GRANT_LIFETIME_NS: u64 = 90 * 24 * 60 * 60 * 1_000_000_000;

/// Hard cap applied to any enumeration page the caller requests.
pub const MAX_PAGE_SIZE: u64 = 100;

/// Decimal digits in the treasury subaccount label. Fixed width so the label is
/// stable; the address is derived, never hard-coded.
const TREASURY_LABEL_DIGITS: usize = 8;

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    OwnerById,
    TokenMetadata,
    TokensPerOwner,
    Approvals,
    Agents,
    TokenByTreasury,
    ExecutorToken,
}

/// Argument type for `set_executor`.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GrantArg {
    pub executor_id: AccountId,
    pub recipients: Vec<AccountId>,
    pub per_payment_cap: U128,
    pub total_budget: U128,
    /// Decimal nanoseconds. Carried as a string so it never loses precision in
    /// JavaScript clients (ns timestamps exceed 2^53).
    pub expires_at_ns: U64,
}

/// What the treasury returns to this contract through the promise chain.
#[near(serializers = [json])]
struct WalletDispatchOutcome {
    operation_id: String,
    status: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Settlement {
    Succeeded,
    Failed,
}

#[near(contract_state)]
pub struct Registry {
    tokens: NonFungibleToken,
    metadata: NFTContractMetadata,
    agents: LookupMap<TokenId, AgentRecord>,
    /// Immutable reverse binding, also used to reject treasury reuse.
    token_by_treasury: LookupMap<AccountId, TokenId>,
    /// Prevents one executor being actively shared between agents (PLAN.md §4).
    executor_token: LookupMap<AccountId, TokenId>,
    /// Monotonic reservation counter. Never recycled.
    next_token_id: u64,
    wallet_code_hash: Vec<u8>,
}

impl Default for Registry {
    /// Required by near-sdk 5.30's `state_read().unwrap_or_default()`. Inert: an
    /// uninitialized registry has no tokens, so no title exists to act on.
    fn default() -> Self {
        const INERT: &str = "nivry-uninitialized";
        use near_contract_standards::non_fungible_token::metadata::NFT_METADATA_SPEC;
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::OwnerById,
                INERT.parse().expect("inert owner sentinel is valid"),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::TokensPerOwner),
                Some(StorageKey::Approvals),
            ),
            metadata: NFTContractMetadata {
                spec: NFT_METADATA_SPEC.to_owned(),
                name: "Nivry Agent".to_owned(),
                symbol: "NIVRY".to_owned(),
                icon: None,
                base_uri: None,
                reference: None,
                reference_hash: None,
            },
            agents: LookupMap::new(StorageKey::Agents),
            token_by_treasury: LookupMap::new(StorageKey::TokenByTreasury),
            executor_token: LookupMap::new(StorageKey::ExecutorToken),
            next_token_id: 1,
            wallet_code_hash: Vec::new(),
        }
    }
}

#[near]
impl Registry {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        let registry = env::current_account_id();
        require!(
            registry.as_str().len() + 1 + TREASURY_LABEL_DIGITS <= 64,
            "registry account id is too long to derive treasury subaccounts"
        );

        let mut this = Self::default();
        this.tokens.owner_id = owner_id;
        this.wallet_code_hash = env::sha256(AGENT_WALLET_WASM).to_vec();
        this
    }

    // ---- provisioning --------------------------------------------------

    /// Reserves a monotonic token id, then asynchronously creates, funds, deploys
    /// and initializes the keyless treasury.
    ///
    /// The batch contains **no key actions**: that is the structural guarantee, not
    /// a policy. The token cannot be transferred or given an executor until the
    /// batch confirms. Returns the reserved `token_id`.
    #[payable]
    pub fn create_agent(&mut self, manifest: Manifest, expected_cost: U128) -> String {
        manifest.validate();

        let cost = Self::provisioning_cost_yocto();
        require!(
            expected_cost.0 == cost,
            "expected_cost does not match the published provisioning cost"
        );
        require!(
            env::attached_deposit().as_yoctonear() == cost,
            "attach exactly the published provisioning cost"
        );

        let numeric = self.next_token_id;
        self.next_token_id = numeric.checked_add(1).expect("token id overflow");
        let token_id = numeric.to_string();

        let treasury_account_id =
            Self::derive_treasury_account_id(&env::current_account_id(), numeric);
        require!(
            !self.token_by_treasury.contains_key(&treasury_account_id),
            "treasury account id already bound"
        );

        let funder = env::predecessor_account_id();
        let manifest_hash = manifest.sha256_hex();

        self.agents.insert(
            token_id.clone(),
            AgentRecord {
                lifecycle: Lifecycle::Provisioning,
                treasury_account_id: treasury_account_id.clone(),
                authority_epoch: 1,
                ownership_change_count: 0,
                frozen: false,
                executor_grant: None,
                next_command_nonce: 1,
                pending_operation: None,
                manifest,
                manifest_hash: manifest_hash.clone(),
                funder: funder.clone(),
            },
        );
        self.token_by_treasury
            .insert(treasury_account_id.clone(), token_id.clone());

        emit(
            "agent_reserved",
            json!({
                "token_id": token_id,
                "treasury_account_id": treasury_account_id,
                "funder": funder,
                "manifest_hash": manifest_hash,
            }),
        );

        let init_args = serialize(&json!({
            "registry": env::current_account_id(),
            "token_id": token_id,
        }));
        let callback_args = serialize(&json!({ "token_id": token_id }));

        // CreateAccount + Transfer + DeployContract + FunctionCall are applied
        // atomically inside one receipt. There is intentionally no
        // `add_full_access_key` anywhere in this batch.
        Promise::new(treasury_account_id)
            .create_account()
            .transfer(WALLET_INITIAL_BALANCE)
            .deploy_contract(AGENT_WALLET_WASM.to_vec())
            .function_call("new".to_owned(), init_args, ZERO_YOCTO, CREATE_AGENT_GAS)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_create_agent".to_owned(),
                callback_args,
                ZERO_YOCTO,
                SETTLE_GAS,
            ))
            .detach();

        token_id
    }

    /// Private resolution of the creation batch.
    ///
    /// * confirmed -> mint the title, mark `Ready`
    /// * failed    -> mark `Failed`, refund the child funding portion
    /// * otherwise -> mark `Uncertain`, refund nothing, reconcile off-chain
    #[private]
    pub fn on_create_agent(&mut self, token_id: String) {
        let mut agent = match self.agents.get(&token_id) {
            Some(agent) => agent.clone(),
            None => {
                emit(
                    "agent_provisioning_unknown",
                    json!({ "token_id": token_id }),
                );
                return;
            }
        };

        require!(
            agent.lifecycle == Lifecycle::Provisioning,
            "agent is not provisioning"
        );

        if env::promise_results_count() != 1 {
            agent.lifecycle = Lifecycle::Uncertain;
            self.agents.insert(token_id.clone(), agent);
            emit(
                "agent_provisioning_uncertain",
                json!({ "token_id": token_id, "reason": "missing_promise_result" }),
            );
            return;
        }

        match env::promise_result_checked(0, MAX_CALLBACK_RESULT_BYTES) {
            Ok(_) => {
                let metadata = Self::token_metadata(&agent);
                self.tokens
                    .internal_mint(token_id.clone(), agent.funder.clone(), Some(metadata));
                agent.lifecycle = Lifecycle::Ready;
                emit(
                    "agent_ready",
                    json!({ "token_id": token_id, "manifest_hash": agent.manifest_hash }),
                );
                self.agents.insert(token_id, agent);
            }
            Err(_) => {
                // The child batch is atomic, so a failed batch left no treasury.
                // Refund only the child funding; the registry keeps the storage
                // allowance for the failed record it retains.
                let funder = agent.funder.clone();
                agent.lifecycle = Lifecycle::Failed;
                self.agents.insert(token_id.clone(), agent);
                emit("agent_provisioning_failed", json!({ "token_id": token_id }));
                Promise::new(funder)
                    .transfer(WALLET_INITIAL_BALANCE)
                    .detach();
            }
        }
    }

    // ---- authority -----------------------------------------------------

    /// Install a bounded executor and rotate authority.
    pub fn set_executor(&mut self, token_id: String, expected_epoch: u64, grant: GrantArg) {
        let owner = self.require_owner(&token_id);
        let mut agent = self.load_agent(&token_id);
        self.require_ready_idle(&agent);
        require!(!agent.frozen, "agent is frozen");
        require!(
            agent.authority_epoch == expected_epoch,
            "expected_epoch is stale"
        );

        require!(
            (1..=MAX_RECIPIENTS).contains(&grant.recipients.len()),
            "grant recipients must contain 1..=8 accounts"
        );
        require!(
            grant.per_payment_cap.0 > 0,
            "per_payment_cap must be positive"
        );
        require!(
            grant.total_budget.0 >= grant.per_payment_cap.0,
            "total_budget must be at least per_payment_cap"
        );
        require!(
            grant.expires_at_ns.0 > env::block_timestamp(),
            "grant expiry must be in the future"
        );
        require!(
            grant.expires_at_ns.0.saturating_sub(env::block_timestamp()) <= MAX_GRANT_LIFETIME_NS,
            "grant lifetime exceeds the 90-day maximum"
        );

        // MVP: one active executor per agent, never shared between agents.
        if let Some(bound_to) = self.executor_token.get(&grant.executor_id) {
            require!(
                *bound_to == token_id,
                "executor is already bound to another agent"
            );
        }
        if let Some(previous) = agent.executor_grant.as_ref() {
            if previous.executor_id != grant.executor_id {
                self.executor_token.remove(&previous.executor_id);
            }
        }

        agent.authority_epoch = agent
            .authority_epoch
            .checked_add(1)
            .expect("authority epoch overflow");
        let epoch = agent.authority_epoch;
        agent.executor_grant = Some(ExecutorGrant {
            executor_id: grant.executor_id.clone(),
            owner_at_grant: owner,
            epoch,
            recipients: grant.recipients,
            per_payment_cap_yocto: grant.per_payment_cap.0,
            total_budget_yocto: grant.total_budget.0,
            spent_yocto: 0,
            expires_at_ns: grant.expires_at_ns.0,
        });
        self.executor_token
            .insert(grant.executor_id.clone(), token_id.clone());
        self.agents.insert(token_id.clone(), agent);

        emit(
            "executor_authorized",
            json!({
                "token_id": token_id,
                "executor_id": grant.executor_id,
                "authority_epoch": epoch,
                "per_payment_cap": grant.per_payment_cap,
                "total_budget": grant.total_budget,
                "expires_at_ns": grant.expires_at_ns,
            }),
        );
    }

    /// Remove the executor and rotate authority. Nothing is restored later.
    pub fn revoke_executor(&mut self, token_id: String, expected_epoch: u64) {
        let _owner = self.require_owner(&token_id);
        let mut agent = self.load_agent(&token_id);
        self.require_ready_idle(&agent);
        require!(
            agent.authority_epoch == expected_epoch,
            "expected_epoch is stale"
        );

        let grant = agent
            .executor_grant
            .take()
            .expect("agent has no executor to revoke");
        self.executor_token.remove(&grant.executor_id);
        agent.authority_epoch = agent
            .authority_epoch
            .checked_add(1)
            .expect("authority epoch overflow");
        let epoch = agent.authority_epoch;
        self.agents.insert(token_id.clone(), agent);

        emit(
            "executor_revoked",
            json!({
                "token_id": token_id,
                "executor_id": grant.executor_id,
                "authority_epoch": epoch,
            }),
        );
    }

    /// Owner emergency stop.
    ///
    /// Permitted while a command is unresolved: it invalidates future
    /// authorization but never cancels an already-emitted payment and never clears
    /// its pending record. Unfreezing does not restore the cleared grant.
    pub fn set_frozen(&mut self, token_id: String, expected_epoch: u64, frozen: bool) {
        let _owner = self.require_owner(&token_id);
        let mut agent = self.load_agent(&token_id);
        require!(agent.lifecycle == Lifecycle::Ready, "agent is not ready");
        require!(
            agent.authority_epoch == expected_epoch,
            "expected_epoch is stale"
        );

        if let Some(grant) = agent.executor_grant.take() {
            self.executor_token.remove(&grant.executor_id);
        }
        agent.frozen = frozen;
        agent.authority_epoch = agent
            .authority_epoch
            .checked_add(1)
            .expect("authority epoch overflow");
        let epoch = agent.authority_epoch;
        self.agents.insert(token_id.clone(), agent);

        emit(
            "freeze_changed",
            json!({ "token_id": token_id, "frozen": frozen, "authority_epoch": epoch }),
        );
    }

    // ---- payments ------------------------------------------------------

    /// Bounded native payout authorized by the current executor.
    ///
    /// Authenticated by the *predecessor* account, not a supplied owner string and
    /// not the signer id.
    pub fn execute_payment(
        &mut self,
        token_id: String,
        expected_owner: AccountId,
        authority_epoch: u64,
        nonce: u64,
        recipient: AccountId,
        amount: U128,
        deadline_ns: U64,
    ) -> Promise {
        let mut agent = self.load_agent(&token_id);
        let owner = self.current_owner(&token_id);

        require!(agent.lifecycle == Lifecycle::Ready, "agent is not ready");
        require!(
            agent.pending_operation.is_none(),
            "agent has an unresolved treasury command"
        );
        require!(!agent.frozen, "agent is frozen");
        require!(
            owner == expected_owner,
            "expected_owner is not the current owner"
        );
        require!(
            agent.authority_epoch == authority_epoch,
            "authority_epoch is stale"
        );
        require!(
            nonce == agent.next_command_nonce,
            "nonce is not the next expected nonce"
        );
        require!(
            deadline_ns.0 > env::block_timestamp(),
            "deadline_ns has passed"
        );

        let amount_yocto = amount.0;
        require!(amount_yocto > 0, "amount must be positive");

        let executor = env::predecessor_account_id();
        let grant = agent
            .executor_grant
            .as_ref()
            .expect("agent has no authorized executor");
        require!(
            grant.executor_id == executor,
            "predecessor is not the authorized executor"
        );
        require!(
            grant.epoch == authority_epoch,
            "grant epoch does not match authority_epoch"
        );
        require!(
            grant.owner_at_grant == owner,
            "grant was installed under a different owner"
        );
        require!(
            grant.recipients.contains(&recipient),
            "recipient is not in the grant allowlist"
        );
        require!(
            grant.expires_at_ns > env::block_timestamp(),
            "grant has expired"
        );
        require!(
            amount_yocto <= grant.per_payment_cap_yocto,
            "amount exceeds the per-payment cap"
        );
        let remaining = grant.total_budget_yocto.saturating_sub(grant.spent_yocto);
        require!(
            amount_yocto <= remaining,
            "amount exceeds the remaining grant budget"
        );

        if let Some(grant) = agent.executor_grant.as_mut() {
            grant.spent_yocto = grant
                .spent_yocto
                .checked_add(amount_yocto)
                .expect("grant budget overflow");
        }

        self.schedule_dispatch(
            token_id,
            agent,
            OperationKind::ExecutorPayment,
            recipient,
            amount_yocto,
            amount_yocto,
        )
    }

    /// Owner withdrawal through the same dispatch path, without a grant budget.
    pub fn owner_withdraw(
        &mut self,
        token_id: String,
        expected_epoch: u64,
        nonce: u64,
        recipient: AccountId,
        amount: U128,
    ) -> Promise {
        let _owner = self.require_owner(&token_id);
        let agent = self.load_agent(&token_id);
        self.require_ready_idle(&agent);
        require!(!agent.frozen, "agent is frozen");
        require!(
            agent.authority_epoch == expected_epoch,
            "expected_epoch is stale"
        );
        require!(
            nonce == agent.next_command_nonce,
            "nonce is not the next expected nonce"
        );
        let amount_yocto = amount.0;
        require!(amount_yocto > 0, "amount must be positive");

        self.schedule_dispatch(
            token_id,
            agent,
            OperationKind::OwnerWithdraw,
            recipient,
            amount_yocto,
            0,
        )
    }

    /// Private settlement of one dispatched operation.
    ///
    /// Settles only from the treasury's own recorded result. A failed promise, a
    /// missing result, an unparseable result or a mismatched operation id all leave
    /// the pending record in place: uncertain outcomes stay fail-closed, and
    /// nothing is retried or refunded.
    #[private]
    pub fn on_dispatch_settled(
        &mut self,
        token_id: String,
        operation_id: String,
        authority_epoch: u64,
    ) {
        let mut agent = match self.agents.get(&token_id) {
            Some(agent) => agent.clone(),
            None => {
                emit(
                    "dispatch_uncertain",
                    json!({ "token_id": token_id, "operation_id": operation_id, "reason": "unknown_agent" }),
                );
                return;
            }
        };

        let pending = match agent.pending_operation.clone() {
            Some(pending)
                if pending.operation_id == operation_id && pending.epoch == authority_epoch =>
            {
                pending
            }
            _ => {
                emit(
                    "dispatch_uncertain",
                    json!({ "token_id": token_id, "operation_id": operation_id, "reason": "operation_mismatch" }),
                );
                return;
            }
        };

        let settlement = if env::promise_results_count() != 1 {
            None
        } else {
            match env::promise_result_checked(0, MAX_CALLBACK_RESULT_BYTES) {
                Ok(bytes) => {
                    match near_sdk::serde_json::from_slice::<WalletDispatchOutcome>(&bytes) {
                        Ok(outcome) if outcome.operation_id == operation_id => {
                            match outcome.status.as_str() {
                                "succeeded" => Some(Settlement::Succeeded),
                                "failed" => Some(Settlement::Failed),
                                _ => None,
                            }
                        }
                        _ => None,
                    }
                }
                Err(_) => None,
            }
        };

        let settlement = match settlement {
            Some(settlement) => settlement,
            None => {
                emit(
                    "dispatch_uncertain",
                    json!({ "token_id": token_id, "operation_id": operation_id, "reason": "unproven_outcome" }),
                );
                return;
            }
        };

        // A proven failure restores the reserved grant budget; success keeps it
        // spent. The nonce is never reused either way.
        if settlement == Settlement::Failed && pending.kind == OperationKind::ExecutorPayment {
            if let Some(mut grant) = agent.executor_grant.clone() {
                if grant.epoch == pending.epoch {
                    grant.spent_yocto = grant
                        .spent_yocto
                        .saturating_sub(pending.reserved_budget_yocto);
                    agent.executor_grant = Some(grant);
                }
            }
        }

        agent.pending_operation = None;
        self.agents.insert(token_id.clone(), agent);

        emit(
            "dispatch_settled",
            json!({
                "token_id": token_id,
                "operation_id": operation_id,
                "status": if settlement == Settlement::Succeeded { "succeeded" } else { "failed" },
                "recipient": pending.recipient,
                "amount_yocto": U128(pending.amount_yocto),
            }),
        );
    }

    // ---- NEP-171 and views ---------------------------------------------

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.clone()
    }

    pub fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }

    pub fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(
            account_id,
            from_index,
            Some(limit.unwrap_or(MAX_PAGE_SIZE).min(MAX_PAGE_SIZE)),
        )
    }

    /// Transfer the agent title.
    ///
    /// The NEP-171 approval model authorizes title movement only. An approved
    /// account can move the NFT and nothing else: it cannot spend, grant, freeze or
    /// list. Authority is deliberately not extended to approvals.
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        require!(
            env::attached_deposit() == ONE_YOCTO,
            "Requires attached deposit of exactly 1 yoctoNEAR"
        );

        let mut agent = self.load_agent(&token_id);
        require!(agent.lifecycle == Lifecycle::Ready, "agent is not ready");
        require!(
            agent.pending_operation.is_none(),
            "agent has an unresolved treasury command"
        );

        let sender = env::predecessor_account_id();
        // Enforces owner-or-approved authority, clears approvals and emits
        // NftTransfer. A seller cannot move a token that is still working.
        self.tokens
            .internal_transfer(&sender, &receiver_id, &token_id, approval_id, memo);

        // Nivry authority transition: the generation only moves forward, so
        // A -> B -> A never revives A's old grant.
        agent.authority_epoch = agent
            .authority_epoch
            .checked_add(1)
            .expect("authority epoch overflow");
        if let Some(grant) = agent.executor_grant.take() {
            self.executor_token.remove(&grant.executor_id);
        }
        agent.ownership_change_count = agent
            .ownership_change_count
            .checked_add(1)
            .expect("ownership change count overflow");
        // The buyer does not inherit the previous owner's emergency stop, which
        // would otherwise block the buyer's own first grant. The treasury binding
        // and `next_command_nonce` are untouched.
        agent.frozen = false;

        let epoch = agent.authority_epoch;
        let changes = agent.ownership_change_count;
        self.agents.insert(token_id.clone(), agent);
        emit(
            "ownership_changed",
            json!({
                "token_id": token_id,
                "from": sender,
                "to": receiver_id,
                "authority_epoch": epoch,
                "ownership_change_count": changes,
            }),
        );
    }

    /// Not implemented in this Day-1 skeleton.
    ///
    /// Rejected loudly rather than faked. PLAN.md §9 requires provisional
    /// ownership, a financial lock and a private resolver; a silent no-op would
    /// misrepresent NEP-171 support. Until this exists, treat the release as a
    /// restricted prototype rather than full NEP-171 core support.
    pub fn nft_transfer_call(
        &mut self,
        _receiver_id: AccountId,
        _token_id: TokenId,
        _approval_id: Option<u64>,
        _memo: Option<String>,
        _msg: String,
    ) -> PromiseOrValue<bool> {
        env::panic_str(
            "nft_transfer_call is unsupported in this restricted prototype; use nft_transfer",
        )
    }

    /// Full passport for one agent.
    pub fn agent_info(&self, token_id: String) -> AgentInfo {
        let agent = self.load_agent(&token_id);
        let owner = self.current_owner(&token_id);
        agent.info(token_id, owner)
    }

    /// Exact deposit required by `create_agent`, published rather than hidden.
    pub fn provisioning_cost(&self) -> U128 {
        U128(Self::provisioning_cost_yocto())
    }

    /// SHA-256 of the embedded treasury WASM, lowercase hex.
    ///
    /// Publishing this is not the same as verifying it against deployed bytecode,
    /// and neither is proof of immutability.
    pub fn wallet_code_hash(&self) -> String {
        manifest::to_hex(&self.wallet_code_hash)
    }

    pub fn agent_wallet_wasm_len(&self) -> u64 {
        AGENT_WALLET_WASM.len() as u64
    }

    /// Immutable treasury address for a reserved token id.
    pub fn treasury_account_id(&self, token_id: String) -> AccountId {
        self.load_agent(&token_id).treasury_account_id
    }

    /// The next token id that would be reserved. Monotonic; ids are never reused.
    pub fn next_token_id(&self) -> u64 {
        self.next_token_id
    }
}

/// Shared guards. Kept free of `#[near]` so they are never exported as methods.
impl Registry {
    pub(crate) fn load_agent(&self, token_id: &TokenId) -> AgentRecord {
        self.agents
            .get(token_id)
            .expect("unknown agent token")
            .clone()
    }

    /// Ownership always comes from the NEP-171 title, never a cached copy.
    pub(crate) fn current_owner(&self, token_id: &TokenId) -> AccountId {
        self.tokens
            .owner_by_id
            .get(token_id)
            .expect("unknown token")
            .clone()
    }

    /// Authenticates the *predecessor*, which is what actually called this
    /// contract. A supplied owner string or the signer id is never authority.
    pub(crate) fn require_owner(&self, token_id: &TokenId) -> AccountId {
        let owner = self.current_owner(token_id);
        require!(
            env::predecessor_account_id() == owner,
            "only the current token owner may call this"
        );
        owner
    }

    pub(crate) fn require_ready_idle(&self, agent: &AgentRecord) {
        require!(agent.lifecycle == Lifecycle::Ready, "agent is not ready");
        require!(
            agent.pending_operation.is_none(),
            "agent has an unresolved treasury command"
        );
    }

    pub(crate) fn derive_treasury_account_id(registry: &AccountId, numeric: u64) -> AccountId {
        let label = format!("{:0>width$}", numeric, width = TREASURY_LABEL_DIGITS);
        let candidate = format!("{label}.{registry}");
        require!(
            candidate.len() <= 64,
            "derived treasury account id exceeds maximum length"
        );
        candidate
            .parse()
            .expect("derived treasury account id must be a valid account id")
    }

    pub(crate) fn provisioning_cost_yocto() -> u128 {
        WALLET_INITIAL_BALANCE
            .as_yoctonear()
            .saturating_add(REGISTRY_STORAGE_ALLOWANCE_YOCTO)
    }

    /// Consume the nonce, record the pending operation, then emit the fixed wallet
    /// command. Order matters: the lock exists before any promise is scheduled.
    pub(crate) fn schedule_dispatch(
        &mut self,
        token_id: String,
        mut agent: AgentRecord,
        kind: OperationKind,
        recipient: AccountId,
        amount_yocto: u128,
        reserved_budget_yocto: u128,
    ) -> Promise {
        let nonce = agent.next_command_nonce;
        agent.next_command_nonce = nonce.checked_add(1).expect("nonce overflow");
        let epoch = agent.authority_epoch;
        let treasury_account_id = agent.treasury_account_id.clone();
        let operation_id = format!("{token_id}:{nonce}");

        agent.pending_operation = Some(PendingOperation {
            operation_id: operation_id.clone(),
            nonce,
            kind,
            recipient: recipient.clone(),
            amount_yocto,
            reserved_budget_yocto,
            epoch,
        });
        self.agents.insert(token_id.clone(), agent);

        emit(
            "dispatch_scheduled",
            json!({
                "token_id": token_id.clone(),
                "operation_id": operation_id.clone(),
                "nonce": nonce,
                "authority_epoch": epoch,
                "recipient": recipient,
                "amount_yocto": U128(amount_yocto),
            }),
        );

        let dispatch_args = serialize(&json!({
            "operation_id": operation_id,
            "sequence": nonce,
            "authority_epoch": epoch,
            "recipient": recipient,
            "amount": U128(amount_yocto),
        }));
        let settle_args = serialize(&json!({
            "token_id": token_id,
            "operation_id": operation_id,
            "authority_epoch": epoch,
        }));

        Promise::new(treasury_account_id)
            .function_call(
                "dispatch_native".to_owned(),
                dispatch_args,
                ZERO_YOCTO,
                DISPATCH_GAS,
            )
            .then(Promise::new(env::current_account_id()).function_call(
                "on_dispatch_settled".to_owned(),
                settle_args,
                ZERO_YOCTO,
                SETTLE_GAS,
            ))
    }

    /// NEP-177 metadata for a freshly confirmed agent.
    pub(crate) fn token_metadata(agent: &AgentRecord) -> TokenMetadata {
        TokenMetadata {
            title: Some(agent.manifest.name.clone()),
            description: Some(agent.manifest.description.clone()),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp().to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: Some(agent.manifest.manifest_uri.clone()),
            reference_hash: Some(Base64VecU8::from(agent.manifest.bundle_hash_bytes())),
        }
    }
}

/// NEP-297-shaped event so indexers can rebuild history without trusting the
/// backend.
fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({
            "standard": "nivry",
            "version": "1.0.0",
            "event": event,
            "data": data,
        })
    ));
}

fn serialize(value: &Value) -> Vec<u8> {
    near_sdk::serde_json::to_vec(value).expect("serialize contract arguments")
}
