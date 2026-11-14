/**
 * JSON shapes of the deployed testnet contracts.
 *
 * Mirrors `contracts/registry/src/state.rs` and
 * `contracts/agent-wallet/src/lib.rs`. `U128`/`U64` arrive as decimal strings, so
 * yoctoNEAR never goes through `number` and never loses precision.
 */

/** YoctoNEAR, as a decimal string. `1 NEAR = 10^24`. */
export type Yocto = string;

export type Lifecycle = "provisioning" | "ready" | "failed" | "uncertain";

export type OperationKind = "executor_payment" | "owner_withdraw";

export interface Manifest {
  schema_version: string;
  name: string;
  description: string;
  runtime_hint: string;
  /** Lowercase hex SHA-256 of the published bundle bytes. */
  bundle_sha256: string;
  task_kind: string;
  manifest_uri: string;
}

export interface GrantView {
  executor_id: string;
  owner_at_grant: string;
  epoch: number;
  recipients: string[];
  per_payment_cap_yocto: Yocto;
  total_budget_yocto: Yocto;
  spent_yocto: Yocto;
  remaining_budget_yocto: Yocto;
  expires_at_ns: number;
}

export interface ListingView {
  listing_id: number;
  seller: string;
  version: number;
  price_yocto: Yocto;
  manifest_hash: string;
}

export interface PendingOperationView {
  operation_id: string;
  nonce: number;
  kind: OperationKind;
  recipient: string;
  amount_yocto: Yocto;
  epoch: number;
}

export interface PendingTransferCallView {
  operation_id: string;
  receiver_id: string;
  previous_owner: string;
  epoch: number;
}

export interface AgentInfo {
  token_id: string;
  /** `null` until provisioning confirms and the title is actually minted. */
  owner_id: string | null;
  treasury_account_id: string;
  authority_epoch: number;
  version: number;
  ownership_change_count: number;
  lifecycle: Lifecycle;
  frozen: boolean;
  executor_grant: GrantView | null;
  next_command_nonce: number;
  pending_operation: PendingOperationView | null;
  pending_transfer_call: PendingTransferCallView | null;
  listing: ListingView | null;
  manifest: Manifest;
  manifest_hash: string;
}

export interface OperationView {
  operation_id: string;
  sequence: number;
  authority_epoch: number;
  recipient: string;
  amount_yocto: Yocto;
  status: string;
}

export interface TreasuryInfo {
  registry: string;
  token_id: string;
  balance_yocto: Yocto;
  storage_reserve_yocto: Yocto;
  spendable_yocto: Yocto;
  pending: boolean;
  next_sequence: number;
  last_operation: OperationView | null;
  recorded_payment_count: number;
  recorded_payment_amount_yocto: Yocto;
}
