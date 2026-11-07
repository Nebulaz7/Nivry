//! Authoritative per-agent state (PLAN.md §4, §9, §10) and its JSON views.
//!
//! The NFT title in [`near_contract_standards::non_fungible_token::NonFungibleToken`]
//! is the single source of truth for ownership. This record deliberately does not
//! cache an owner, so no cache can drift from the title.

use crate::manifest::Manifest;
use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

/// Provisioning is asynchronous, so "created" needs more than a boolean.
/// `Uncertain` is a distinct, non-usable state: the creation batch may or may not
/// have landed and nothing is refunded from it (PLAN.md §7).
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Lifecycle {
    Provisioning,
    Ready,
    Failed,
    Uncertain,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OperationKind {
    ExecutorPayment,
    OwnerWithdraw,
}

/// One active executor per agent authority epoch.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecutorGrant {
    pub executor_id: AccountId,
    /// Owner at the moment the grant was installed.
    pub owner_at_grant: AccountId,
    /// Authority generation this grant belongs to.
    pub epoch: u64,
    /// On-chain recipient allowlist. Empty is not a wildcard; `set_executor`
    /// requires at least one entry.
    pub recipients: Vec<AccountId>,
    pub per_payment_cap_yocto: u128,
    pub total_budget_yocto: u128,
    pub spent_yocto: u128,
    pub expires_at_ns: u64,
}

/// At most one unresolved treasury command per token.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingOperation {
    pub operation_id: String,
    pub nonce: u64,
    pub kind: OperationKind,
    pub recipient: AccountId,
    pub amount_yocto: u128,
    /// Grant budget held for this operation, restored only on proven failure.
    pub reserved_budget_yocto: u128,
    pub epoch: u64,
}

/// An inline fixed-price listing (PLAN.md §10).
///
/// The price and manifest commitment are captured at listing time and re-checked
/// at purchase, so a buyer can never be charged a price they did not see.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Listing {
    pub listing_id: u64,
    pub seller: AccountId,
    /// Authority epoch at listing time.
    pub epoch: u64,
    pub price_yocto: u128,
    /// The manifest the seller committed to. Buying binds this value.
    pub manifest_hash: String,
}

/// An unresolved `nft_transfer_call` (PLAN.md §9).
///
/// While this exists the token is financially frozen: no treasury command, owner
/// withdrawal, grant change, listing, forwarding transfer or manifest change.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingTransferCall {
    pub operation_id: String,
    pub receiver_id: AccountId,
    pub previous_owner: AccountId,
    /// Approvals captured when the title moved provisionally. Restored only if the
    /// receiver returns the token. Never used to restore a grant.
    pub approvals: Vec<(AccountId, u64)>,
    pub epoch: u64,
}

/// A pull-payment liability owed by the registry to a seller.
///
/// Deliberately separate from agent treasury funds: no child-wallet balance can
/// ever back a seller credit.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SaleWithdrawal {
    pub operation_id: String,
    pub nonce: u64,
    pub amount_yocto: u128,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SellerCredit {
    /// Claimable now.
    pub available_yocto: u128,
    /// Reserved for one in-flight withdrawal.
    pub reserved_yocto: u128,
    /// Monotonic application nonce for withdrawal operations.
    pub next_nonce: u64,
    pub pending_withdrawal: Option<SaleWithdrawal>,
}

impl SellerCredit {
    pub fn new() -> Self {
        Self {
            available_yocto: 0,
            reserved_yocto: 0,
            next_nonce: 1,
            pending_withdrawal: None,
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentRecord {
    pub lifecycle: Lifecycle,
    /// Immutable binding to the deployed keyless treasury.
    pub treasury_account_id: AccountId,
    /// Monotonic authority generation. NOT NEAR's blockchain epoch.
    pub authority_epoch: u64,
    pub ownership_change_count: u64,
    pub frozen: bool,
    pub executor_grant: Option<ExecutorGrant>,
    /// Monotonic application nonce. Never reset or reused.
    pub next_command_nonce: u64,
    pub pending_operation: Option<PendingOperation>,
    /// At most one unresolved `nft_transfer_call`.
    pub pending_transfer_call: Option<PendingTransferCall>,
    /// Monotonic per-token listing counter.
    pub next_listing_id: u64,
    pub listing: Option<Listing>,
    /// Fixed at creation; never edited in the MVP.
    pub manifest: Manifest,
    pub manifest_hash: String,
    /// Account that funded provisioning; used for the failure refund and mint.
    pub funder: AccountId,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GrantView {
    pub executor_id: AccountId,
    pub owner_at_grant: AccountId,
    pub epoch: u64,
    pub recipients: Vec<AccountId>,
    pub per_payment_cap_yocto: U128,
    pub total_budget_yocto: U128,
    pub spent_yocto: U128,
    pub remaining_budget_yocto: U128,
    pub expires_at_ns: u64,
}

impl From<&ExecutorGrant> for GrantView {
    fn from(grant: &ExecutorGrant) -> Self {
        Self {
            executor_id: grant.executor_id.clone(),
            owner_at_grant: grant.owner_at_grant.clone(),
            epoch: grant.epoch,
            recipients: grant.recipients.clone(),
            per_payment_cap_yocto: U128(grant.per_payment_cap_yocto),
            total_budget_yocto: U128(grant.total_budget_yocto),
            spent_yocto: U128(grant.spent_yocto),
            remaining_budget_yocto: U128(
                grant.total_budget_yocto.saturating_sub(grant.spent_yocto),
            ),
            expires_at_ns: grant.expires_at_ns,
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingOperationView {
    pub operation_id: String,
    pub nonce: u64,
    pub kind: OperationKind,
    pub recipient: AccountId,
    pub amount_yocto: U128,
    pub epoch: u64,
}

impl From<&PendingOperation> for PendingOperationView {
    fn from(operation: &PendingOperation) -> Self {
        Self {
            operation_id: operation.operation_id.clone(),
            nonce: operation.nonce,
            kind: operation.kind,
            recipient: operation.recipient.clone(),
            amount_yocto: U128(operation.amount_yocto),
            epoch: operation.epoch,
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ListingView {
    pub listing_id: u64,
    pub seller: AccountId,
    pub epoch: u64,
    pub price_yocto: U128,
    pub manifest_hash: String,
}

impl From<&Listing> for ListingView {
    fn from(listing: &Listing) -> Self {
        Self {
            listing_id: listing.listing_id,
            seller: listing.seller.clone(),
            epoch: listing.epoch,
            price_yocto: U128(listing.price_yocto),
            manifest_hash: listing.manifest_hash.clone(),
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingTransferCallView {
    pub operation_id: String,
    pub receiver_id: AccountId,
    pub previous_owner: AccountId,
    pub epoch: u64,
}

impl From<&PendingTransferCall> for PendingTransferCallView {
    fn from(pending: &PendingTransferCall) -> Self {
        Self {
            operation_id: pending.operation_id.clone(),
            receiver_id: pending.receiver_id.clone(),
            previous_owner: pending.previous_owner.clone(),
            epoch: pending.epoch,
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SellerCreditView {
    pub account_id: AccountId,
    pub available_yocto: U128,
    pub reserved_yocto: U128,
    pub pending_withdrawal_operation_id: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentInfo {
    pub token_id: String,
    /// Read from the NFT title, never a cached copy. `None` until provisioning
    /// confirms and the title is actually minted, so the Create screen can render
    /// an in-progress agent instead of failing.
    pub owner_id: Option<AccountId>,
    pub treasury_account_id: AccountId,
    pub authority_epoch: u64,
    pub ownership_change_count: u64,
    pub lifecycle: Lifecycle,
    pub frozen: bool,
    pub executor_grant: Option<GrantView>,
    pub next_command_nonce: u64,
    pub pending_operation: Option<PendingOperationView>,
    pub pending_transfer_call: Option<PendingTransferCallView>,
    pub listing: Option<ListingView>,
    pub manifest: Manifest,
    pub manifest_hash: String,
}

impl AgentRecord {
    pub fn info(&self, token_id: String, owner_id: Option<AccountId>) -> AgentInfo {
        AgentInfo {
            token_id,
            owner_id,
            treasury_account_id: self.treasury_account_id.clone(),
            authority_epoch: self.authority_epoch,
            ownership_change_count: self.ownership_change_count,
            lifecycle: self.lifecycle,
            frozen: self.frozen,
            executor_grant: self.executor_grant.as_ref().map(GrantView::from),
            next_command_nonce: self.next_command_nonce,
            pending_operation: self
                .pending_operation
                .as_ref()
                .map(PendingOperationView::from),
            pending_transfer_call: self
                .pending_transfer_call
                .as_ref()
                .map(PendingTransferCallView::from),
            listing: self.listing.as_ref().map(ListingView::from),
            manifest: self.manifest.clone(),
            manifest_hash: self.manifest_hash.clone(),
        }
    }
}
