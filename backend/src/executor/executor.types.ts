export type ExecutorMode = 'local_key_signer';

export { ExecutePaymentRequestDto } from './dto/execute-payment.dto';

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
