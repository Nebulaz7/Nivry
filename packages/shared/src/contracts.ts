import type { Manifest } from './manifest.js';

export type Lifecycle = 'provisioning' | 'ready' | 'failed' | 'uncertain';

export type OperationKind = 'executor_payment' | 'owner_withdraw';

export type OperationStatus = 'pending' | 'succeeded' | 'failed';

/**
 * Parameters for setting an executor grant on the registry contract.
 */
export interface GrantArg {
  executor_id: string;
  recipients: string[];
  /** Decimal yoctoNEAR string (U128) */
  per_payment_cap: string;
  /** Decimal yoctoNEAR string (U128) */
  total_budget: string;
  /** Decimal nanoseconds string (U64) */
  expires_at_ns: string;
}

/**
 * On-chain grant view returned by `agent_info`.
 */
export interface GrantView {
  executor_id: string;
  owner_at_grant: string;
  epoch: number;
  recipients: string[];
  per_payment_cap_yocto: string;
  total_budget_yocto: string;
  spent_yocto: string;
  remaining_budget_yocto: string;
  expires_at_ns: number;
}

/**
 * Bounded pending operation record on the registry.
 */
export interface PendingOperationView {
  operation_id: string;
  nonce: number;
  kind: OperationKind;
  recipient: string;
  amount_yocto: string;
  epoch: number;
}

/**
 * Complete view of an agent NFT and its authority state.
 */
export interface AgentInfo {
  token_id: string;
  owner_id: string;
  treasury_account_id: string;
  authority_epoch: number;
  ownership_change_count: number;
  lifecycle: Lifecycle;
  frozen: boolean;
  executor_grant: GrantView | null;
  next_command_nonce: number;
  pending_operation: PendingOperationView | null;
  manifest: Manifest;
  manifest_hash: string;
}

/**
 * Treasury outbound operation record view.
 */
export interface OperationView {
  operation_id: string;
  sequence: number;
  authority_epoch: number;
  recipient: string;
  amount_yocto: string;
  status: OperationStatus;
}

/**
 * View of the keyless treasury account state.
 */
export interface TreasuryInfo {
  registry: string;
  token_id: string;
  balance_yocto: string;
  storage_reserve_yocto: string;
  spendable_yocto: string;
  pending: boolean;
  next_sequence: number;
  last_operation: OperationView | null;
  recorded_payment_count: number;
  recorded_payment_amount_yocto: string;
}

/**
 * Arguments for calling `create_agent` on the registry.
 */
export interface CreateAgentArgs {
  manifest: Manifest;
  /** Decimal yoctoNEAR string (U128). Must equal `provisioning_cost()` and the attached deposit. */
  expected_cost: string;
}

/**
 * Arguments for calling `set_executor` on the registry.
 */
export interface SetExecutorArgs {
  token_id: string;
  expected_epoch: number;
  grant: GrantArg;
}

/**
 * Arguments for calling `revoke_executor` on the registry.
 */
export interface RevokeExecutorArgs {
  token_id: string;
  expected_epoch: number;
}

/**
 * Arguments for calling `set_frozen` on the registry.
 */
export interface SetFrozenArgs {
  token_id: string;
  expected_epoch: number;
  frozen: boolean;
}

/**
 * Arguments for calling `execute_payment` on the registry.
 */
export interface ExecutePaymentArgs {
  token_id: string;
  expected_owner: string;
  authority_epoch: number;
  nonce: number;
  recipient: string;
  amount: string;
  deadline_ns: string;
}

/**
 * Arguments for calling `owner_withdraw` on the registry.
 */
export interface OwnerWithdrawArgs {
  token_id: string;
  expected_epoch: number;
  nonce: number;
  recipient: string;
  amount: string;
}

/**
 * Arguments for calling `pay_agent` on the keyless treasury.
 */
export interface PayAgentArgs {
  payment_reference_hash: string;
  observed_authority_epoch: number;
}

