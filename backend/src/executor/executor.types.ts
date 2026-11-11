export type ExecutorMode = 'outlayer_tee_custody' | 'local_key_non_tee';

export interface ExecutePaymentRequestDto {
  token_id: string;
  recipient: string;
  /** Exact non-negative decimal yoctoNEAR string */
  amount_yocto: string;
  /** Optional expected owner guard; defaults to live chain owner_id if omitted */
  expected_owner?: string;
  /** Optional expected authority epoch guard; defaults to live chain authority_epoch if omitted */
  authority_epoch?: number;
  /** Optional command nonce guard; defaults to live chain next_command_nonce if omitted */
  nonce?: number;
  /** Optional deadline in nanoseconds; defaults to now + 5 minutes if omitted */
  deadline_ns?: string;
}

export interface ExecutePaymentContractArgs {
  token_id: string;
  expected_owner: string;
  authority_epoch: number;
  nonce: number;
  recipient: string;
  amount: string;
  deadline_ns: string;
}

export interface ExecutorStatusView {
  mode: ExecutorMode;
  mode_label: string;
  executor_account_id: string;
  registry_contract_id: string;
  outlayer_configured: boolean;
}

export interface PaymentExecutionOutcome {
  token_id: string;
  executor_account_id: string;
  mode: ExecutorMode;
  mode_label: string;
  transaction_hash: string;
  succeeded: boolean;
  contract_args: ExecutePaymentContractArgs;
  ingestion: {
    inserted_events: number;
    duplicate_events: number;
    rejected_events: Array<{
      receipt_id: string;
      log_index: number;
      reason: string;
    }>;
  };
}

