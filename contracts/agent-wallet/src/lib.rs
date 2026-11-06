//! Nivry keyless treasury: one immutable account per agent NFT.
//!
//! Design constraints this file exists to enforce (PLAN.md §5, §6):
//!
//! * No way to add an access key, upgrade code, delete the account, replace a
//!   controller, or perform an arbitrary self-action.
//! * Outbound native NEAR is dispatched only by the immutable registry, and only
//!   through the fixed `dispatch_native` command. There is no caller-selected
//!   method, action, or callback.
//! * The wallet never caches an owner and never accepts commands directly from an
//!   NFT owner or executor. The registry performs the fresh ownership check.
//! * Storage/operating reserve is never spendable.
//!
//! Detailed history lives in events; state keeps one bounded latest-operation
//! record plus a monotonic command sequence, which is enough for active-operation
//! reconciliation and duplicate rejection.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise};

/// Extra bytes reserved on top of current usage so writing the operation record
/// itself can never eat into the spendable balance.
const STORAGE_GROWTH_ALLOWANCE_BYTES: u64 = 1_024;

/// Gas float kept back for this account's own execution and callbacks.
/// Never spendable by a dispatch.
const OPERATING_RESERVE_YOCTO: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR

/// Upper bound on any identifier this contract stores or logs.
const MAX_IDENTIFIER_LEN: usize = 64;

/// Bound on the result bytes read from a callback promise.
const MAX_CALLBACK_RESULT_BYTES: usize = 128;

const FINALIZE_GAS: Gas = Gas::from_tgas(15);

/// Current status of the single bounded operation record.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OperationStatus {
    Pending,
    Succeeded,
    Failed,
}

/// Bounded record of the most recent outbound command.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OperationRecord {
    pub operation_id: String,
    pub sequence: u64,
    pub authority_epoch: u64,
    pub recipient: AccountId,
    pub amount_yocto: u128,
    pub status: OperationStatus,
}

/// JSON view of [`OperationRecord`]. Amounts are decimal yoctoNEAR strings.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OperationView {
    pub operation_id: String,
    pub sequence: u64,
    pub authority_epoch: u64,
    pub recipient: AccountId,
    pub amount_yocto: U128,
    pub status: OperationStatus,
}

impl From<&OperationRecord> for OperationView {
    fn from(record: &OperationRecord) -> Self {
        Self {
            operation_id: record.operation_id.clone(),
            sequence: record.sequence,
            authority_epoch: record.authority_epoch,
            recipient: record.recipient.clone(),
            amount_yocto: U128(record.amount_yocto),
            status: record.status,
        }
    }
}

/// Terminal outcome returned to the registry through the promise chain, so the
/// registry settles from the wallet's own persisted result rather than from a
/// caller-asserted value.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DispatchOutcome {
    pub operation_id: String,
    pub status: OperationStatus,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreasuryInfo {
    pub registry: AccountId,
    pub token_id: String,
    pub balance_yocto: U128,
    pub storage_reserve_yocto: U128,
    pub spendable_yocto: U128,
    pub pending: bool,
    pub next_sequence: u64,
    pub last_operation: Option<OperationView>,
    pub recorded_payment_count: u64,
    pub recorded_payment_amount_yocto: U128,
}

#[near(contract_state)]
pub struct AgentWallet {
    /// Immutable. The only account allowed to dispatch outbound value.
    registry: AccountId,
    /// Immutable. The agent identity this treasury belongs to.
    token_id: String,
    /// Monotonic command sequence. Never reset or reused.
    next_sequence: u64,
    /// At most one outbound command may be unresolved.
    pending: bool,
    last_operation: Option<OperationRecord>,
    recorded_payment_count: u64,
    recorded_payment_amount_yocto: u128,
}

#[near]
impl AgentWallet {
    /// One-time initialization. `#[init]` rejects any later call, so there is no
    /// public reinitializer and no way to rebind the registry.
    #[init]
    pub fn new(registry: AccountId, token_id: String) -> Self {
        require!(
            token_id.len() <= MAX_IDENTIFIER_LEN,
            "token_id exceeds maximum length"
        );
        Self {
            registry,
            token_id,
            next_sequence: 1,
            pending: false,
            last_operation: None,
            recorded_payment_count: 0,
            recorded_payment_amount_yocto: 0,
        }
    }

    /// Customer receipt for a service payment.
    ///
    /// This records that native NEAR arrived and nothing more: not that work was
    /// delivered, not that the payer is independent, and not that the payment was
    /// genuine revenue. The caller-supplied epoch is labelled *observed* and is
    /// never used as ownership evidence.
    #[payable]
    pub fn pay_agent(&mut self, payment_reference_hash: String, observed_authority_epoch: u64) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "pay_agent requires a positive attached deposit");
        require!(
            payment_reference_hash.len() <= MAX_IDENTIFIER_LEN,
            "payment_reference_hash exceeds maximum length"
        );

        self.recorded_payment_count = self
            .recorded_payment_count
            .checked_add(1)
            .expect("payment count overflow");
        self.recorded_payment_amount_yocto = self
            .recorded_payment_amount_yocto
            .checked_add(amount)
            .expect("recorded payment amount overflow");

        emit(
            "payment_recorded",
            json!({
                "payer": env::predecessor_account_id(),
                "amount_yocto": U128(amount),
                "payment_reference_hash": payment_reference_hash,
                "observed_authority_epoch": observed_authority_epoch,
            }),
        );
    }

    /// Plain funding. Explicitly not service revenue.
    #[payable]
    pub fn deposit(&mut self) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "deposit requires a positive attached deposit");
        emit(
            "deposit_received",
            json!({ "payer": env::predecessor_account_id(), "amount_yocto": U128(amount) }),
        );
    }

    /// Fixed outbound command. Callable only by the immutable registry.
    ///
    /// Returns the complete `transfer.then(finalize)` promise chain so the
    /// registry's own callback waits for the wallet's terminal result, not merely
    /// for acceptance of the command.
    pub fn dispatch_native(
        &mut self,
        operation_id: String,
        sequence: u64,
        authority_epoch: u64,
        recipient: AccountId,
        amount: U128,
    ) -> Promise {
        require!(
            env::predecessor_account_id() == self.registry,
            "dispatch_native is callable only by the bound registry"
        );
        require!(!self.pending, "a treasury command is already unresolved");
        require!(
            sequence == self.next_sequence,
            "sequence must equal the next expected command sequence"
        );
        require!(!operation_id.is_empty(), "operation_id must not be empty");
        require!(
            operation_id.len() <= MAX_IDENTIFIER_LEN,
            "operation_id exceeds maximum length"
        );

        let amount_yocto = amount.0;
        require!(amount_yocto > 0, "amount must be positive");

        // Reserve against storage-safe liquidity *before* scheduling anything.
        let reserve = self.storage_reserve_yocto();
        let balance = env::account_balance().as_yoctonear();
        require!(
            balance >= reserve.saturating_add(amount_yocto),
            "amount exceeds spendable balance after storage and operating reserve"
        );

        self.next_sequence = self
            .next_sequence
            .checked_add(1)
            .expect("sequence overflow");
        self.pending = true;
        self.last_operation = Some(OperationRecord {
            operation_id: operation_id.clone(),
            sequence,
            authority_epoch,
            recipient: recipient.clone(),
            amount_yocto,
            status: OperationStatus::Pending,
        });

        emit(
            "dispatch_queued",
            json!({
                "operation_id": operation_id,
                "sequence": sequence,
                "authority_epoch": authority_epoch,
                "recipient": recipient,
                "amount_yocto": U128(amount_yocto),
            }),
        );

        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(amount_yocto))
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "finalize_dispatch".to_owned(),
                    near_sdk::serde_json::to_vec(&json!({
                        "operation_id": operation_id,
                        "sequence": sequence,
                    }))
                    .expect("serialize finalize args"),
                    NearToken::from_yoctonear(0),
                    FINALIZE_GAS,
                ),
            )
    }

    /// Private terminal settlement of the outbound command.
    ///
    /// Reads only the promise result of its own `transfer`, persists the outcome,
    /// and returns it so the registry can settle its reservation from a value this
    /// contract itself recorded.
    #[private]
    pub fn finalize_dispatch(&mut self, operation_id: String, sequence: u64) -> DispatchOutcome {
        require!(
            env::promise_results_count() == 1,
            "finalize_dispatch expects exactly one promise result"
        );
        let outcome = match env::promise_result_checked(0, MAX_CALLBACK_RESULT_BYTES) {
            // A plain `transfer` returns no data, so `TooLong` cannot occur here;
            // any error therefore means the transfer itself failed.
            Ok(_) => OperationStatus::Succeeded,
            Err(_) => OperationStatus::Failed,
        };
        self.settle_dispatch(&operation_id, sequence, outcome)
    }

    // ---- views -------------------------------------------------------------

    pub fn treasury_info(&self) -> TreasuryInfo {
        let balance = env::account_balance().as_yoctonear();
        let reserve = self.storage_reserve_yocto();
        TreasuryInfo {
            registry: self.registry.clone(),
            token_id: self.token_id.clone(),
            balance_yocto: U128(balance),
            storage_reserve_yocto: U128(reserve),
            spendable_yocto: U128(balance.saturating_sub(reserve)),
            pending: self.pending,
            next_sequence: self.next_sequence,
            last_operation: self.last_operation.as_ref().map(OperationView::from),
            recorded_payment_count: self.recorded_payment_count,
            recorded_payment_amount_yocto: U128(self.recorded_payment_amount_yocto),
        }
    }

    /// Bounded lookup: only the single retained operation can be answered.
    pub fn operation_status(&self, operation_id: String) -> Option<OperationView> {
        self.last_operation
            .as_ref()
            .filter(|record| record.operation_id == operation_id)
            .map(OperationView::from)
    }

    pub fn registry(&self) -> AccountId {
        self.registry.clone()
    }

    pub fn token_id(&self) -> String {
        self.token_id.clone()
    }
}

impl Default for AgentWallet {
    /// near-sdk 5.30 reads contract state with
    /// `ContractState::state_read().unwrap_or_default()`, so the state type must
    /// implement `Default`. This value is inert: with an empty registry binding
    /// `dispatch_native` can never match a predecessor, and `#[init]` still
    /// rejects any second initialization.
    fn default() -> Self {
        // A valid but unreachable sentinel. Top-level NEAR accounts are either
        // `*.near`, `*.testnet`, or 64-hex implicit accounts, so no real
        // predecessor can ever equal this label, which keeps `dispatch_native`
        // closed on an uninitialized state.
        const INERT_REGISTRY: &str = "nivry-uninitialized";
        Self {
            registry: INERT_REGISTRY
                .parse()
                .expect("inert registry sentinel is a valid account id"),
            token_id: String::new(),
            next_sequence: 1,
            pending: false,
            last_operation: None,
            recorded_payment_count: 0,
            recorded_payment_amount_yocto: 0,
        }
    }
}

impl AgentWallet {
    /// Reserve covering this account's storage plus a fixed gas/reserve float.
    /// Recomputed against live usage so growth of the operation record is covered.
    fn storage_reserve_yocto(&self) -> u128 {
        let bytes = u128::from(env::storage_usage())
            .saturating_add(u128::from(STORAGE_GROWTH_ALLOWANCE_BYTES));
        let per_byte = env::storage_byte_cost().as_yoctonear();
        bytes
            .saturating_mul(per_byte)
            .saturating_add(OPERATING_RESERVE_YOCTO)
    }

    /// Persists a terminal outcome for the retained operation.
    ///
    /// Deliberately free of environment reads so it can be unit-tested directly.
    /// Idempotent for a repeated identical terminal outcome; a conflicting
    /// outcome is rejected rather than overwritten.
    pub fn settle_dispatch(
        &mut self,
        operation_id: &str,
        sequence: u64,
        outcome: OperationStatus,
    ) -> DispatchOutcome {
        require!(
            outcome != OperationStatus::Pending,
            "cannot settle an operation as pending"
        );
        let mut record = self
            .last_operation
            .clone()
            .expect("no operation record to settle");
        require!(
            record.operation_id == operation_id,
            "operation_id does not match the retained operation"
        );
        require!(
            record.sequence == sequence,
            "sequence does not match the retained operation"
        );
        if record.status != OperationStatus::Pending {
            require!(
                record.status == outcome,
                "operation already settled with a conflicting outcome"
            );
            return DispatchOutcome {
                operation_id: record.operation_id,
                status: record.status,
            };
        }

        record.status = outcome;
        self.pending = false;
        self.last_operation = Some(record.clone());

        DispatchOutcome {
            operation_id: record.operation_id,
            status: outcome,
        }
    }
}

/// NEP-297-shaped event so indexers can order wallet history without trusting
/// the backend.
fn emit(event: &str, data: near_sdk::serde_json::Value) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, PromiseResult};

    const TREASURY: &str = "00000001.registry.test.near";
    const REGISTRY: &str = "registry.test.near";

    fn account(id: &str) -> AccountId {
        id.parse().unwrap()
    }

    fn builder(predecessor: &str) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account(TREASURY))
            .predecessor_account_id(account(predecessor))
            .block_timestamp(1_000_000_000)
            .account_balance(NearToken::from_near(10));
        builder
    }

    fn wallet() -> AgentWallet {
        testing_env!(builder(REGISTRY).build());
        AgentWallet::new(account(REGISTRY), "1".to_owned())
    }

    fn wallet_with_pending() -> AgentWallet {
        let mut wallet = wallet();
        wallet.pending = true;
        wallet.last_operation = Some(OperationRecord {
            operation_id: "1:1".to_owned(),
            sequence: 1,
            authority_epoch: 2,
            recipient: account("bob.test.near"),
            amount_yocto: 1_000,
            status: OperationStatus::Pending,
        });
        wallet
    }

    #[test]
    fn new_starts_at_sequence_one_and_unpending() {
        let wallet = wallet();
        assert_eq!(wallet.next_sequence, 1);
        assert!(!wallet.pending);
        assert!(wallet.last_operation.is_none());
        assert_eq!(wallet.recorded_payment_count, 0);
    }

    #[test]
    fn settle_marks_success_and_releases_lock() {
        let mut wallet = wallet();
        wallet.pending = true;
        wallet.last_operation = Some(OperationRecord {
            operation_id: "1:1".to_owned(),
            sequence: 1,
            authority_epoch: 2,
            recipient: account("bob.test.near"),
            amount_yocto: 1_000,
            status: OperationStatus::Pending,
        });

        let outcome = wallet.settle_dispatch("1:1", 1, OperationStatus::Succeeded);
        assert_eq!(outcome.status, OperationStatus::Succeeded);
        assert!(!wallet.pending);
        assert_eq!(
            wallet.last_operation.as_ref().unwrap().status,
            OperationStatus::Succeeded
        );
    }

    #[test]
    fn settle_is_idempotent_for_the_same_outcome() {
        let mut wallet = wallet();
        wallet.pending = true;
        wallet.last_operation = Some(OperationRecord {
            operation_id: "1:1".to_owned(),
            sequence: 1,
            authority_epoch: 2,
            recipient: account("bob.test.near"),
            amount_yocto: 1_000,
            status: OperationStatus::Pending,
        });
        wallet.settle_dispatch("1:1", 1, OperationStatus::Failed);
        let again = wallet.settle_dispatch("1:1", 1, OperationStatus::Failed);
        assert_eq!(again.status, OperationStatus::Failed);
    }

    #[test]
    #[should_panic(expected = "conflicting outcome")]
    fn settle_rejects_a_conflicting_outcome() {
        let mut wallet = wallet();
        wallet.pending = true;
        wallet.last_operation = Some(OperationRecord {
            operation_id: "1:1".to_owned(),
            sequence: 1,
            authority_epoch: 2,
            recipient: account("bob.test.near"),
            amount_yocto: 1_000,
            status: OperationStatus::Pending,
        });
        wallet.settle_dispatch("1:1", 1, OperationStatus::Succeeded);
        wallet.settle_dispatch("1:1", 1, OperationStatus::Failed);
    }

    #[test]
    #[should_panic(expected = "does not match the retained operation")]
    fn settle_rejects_a_foreign_operation_id() {
        let mut wallet = wallet();
        wallet.last_operation = Some(OperationRecord {
            operation_id: "1:1".to_owned(),
            sequence: 1,
            authority_epoch: 2,
            recipient: account("bob.test.near"),
            amount_yocto: 1_000,
            status: OperationStatus::Pending,
        });
        wallet.settle_dispatch("1:2", 1, OperationStatus::Succeeded);
    }

    #[test]
    fn storage_reserve_exceeds_pure_storage_cost() {
        testing_env!(builder(REGISTRY).build());
        let wallet = AgentWallet::new(account(REGISTRY), "1".to_owned());
        let reserve = wallet.storage_reserve_yocto();
        assert!(reserve >= OPERATING_RESERVE_YOCTO);
    }

    #[test]
    fn treasury_info_reports_zero_payments_initially() {
        testing_env!(builder(REGISTRY).build());
        let wallet = AgentWallet::new(account(REGISTRY), "1".to_owned());
        let info = wallet.treasury_info();
        assert_eq!(info.recorded_payment_count, 0);
        assert_eq!(info.recorded_payment_amount_yocto.0, 0);
        assert_eq!(info.next_sequence, 1);
        assert!(info.last_operation.is_none());
    }

    #[test]
    fn pay_agent_records_a_receipt_and_separates_it_from_deposits() {
        let mut wallet = wallet();
        testing_env!(builder("customer.test.near")
            .attached_deposit(NearToken::from_millinear(5))
            .build());
        wallet.pay_agent("ref-1".to_owned(), 3);
        assert_eq!(wallet.recorded_payment_count, 1);
        assert_eq!(
            wallet.recorded_payment_amount_yocto,
            NearToken::from_millinear(5).as_yoctonear()
        );
    }

    #[test]
    fn dispatch_rejects_a_predecessor_that_is_not_the_registry() {
        let mut wallet = wallet();
        testing_env!(builder("mallory.test.near").build());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            wallet.dispatch_native(
                "1:1".to_owned(),
                1,
                1,
                account("bob.test.near"),
                U128(1_000),
            )
        }));
        assert!(result.is_err());
    }

    #[test]
    fn finalize_success_persists_the_terminal_outcome() {
        let mut wallet = wallet_with_pending();
        testing_env!(
            builder(TREASURY).build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::new(),
            vec![PromiseResult::Successful(Vec::new())],
        );
        let outcome = wallet.finalize_dispatch("1:1".to_owned(), 1);
        assert_eq!(outcome.status, OperationStatus::Succeeded);
        assert_eq!(
            wallet.last_operation.as_ref().unwrap().status,
            OperationStatus::Succeeded
        );
        assert!(!wallet.pending);
    }

    #[test]
    fn finalize_failure_persists_and_releases_the_lock() {
        let mut wallet = wallet_with_pending();
        testing_env!(
            builder(TREASURY).build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::new(),
            vec![PromiseResult::Failed],
        );
        let outcome = wallet.finalize_dispatch("1:1".to_owned(), 1);
        assert_eq!(outcome.status, OperationStatus::Failed);
        assert!(!wallet.pending);
    }

    #[test]
    fn operation_status_only_answers_the_retained_operation() {
        let wallet = wallet_with_pending();
        assert!(wallet.operation_status("1:1".to_owned()).is_some());
        assert!(wallet.operation_status("1:2".to_owned()).is_none());
    }
}
