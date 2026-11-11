import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EventProjectionService } from '../passport/event-projection.service';
import { ChainReaderService } from '../verifier/chain-reader.service';
import type {
  ExecutePaymentContractArgs,
  ExecutePaymentRequestDto,
  ExecutorStatusView,
  PaymentExecutionOutcome,
} from './executor.types';
import { createNearKeyDispatcher } from './near-key-signer';

const DEFAULT_DEADLINE_WINDOW_NS = 5n * 60n * 1_000_000_000n;

export type TransactionDispatchFn = (params: {
  registryContractId: string;
  executorAccountId: string;
  args: ExecutePaymentContractArgs;
}) => Promise<{ transaction_hash: string }>;

@Injectable()
export class ExecutorService {
  private executorAccountId: string;
  private customDispatcher: TransactionDispatchFn | null = null;

  constructor(
    private readonly chainReader: ChainReaderService,
    private readonly projectionService: EventProjectionService,
    private readonly db: DatabaseService,
  ) {
    this.executorAccountId =
      process.env.EXECUTOR_ACCOUNT_ID || 'executor.nivry.testnet';

    const privateKey = process.env.EXECUTOR_PRIVATE_KEY;
    if (privateKey) {
      this.customDispatcher = createNearKeyDispatcher({
        executorAccountId: this.executorAccountId,
        privateKey,
        rpcUrl: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
      });
    }
  }

  /**
   * Allows tests or testnet scripts to inject the transaction signer
   * and configure the active executor account ID.
   */
  configureLocalDispatcher(
    executorAccountId: string,
    dispatcher: TransactionDispatchFn | null,
  ): void {
    this.executorAccountId = executorAccountId;
    this.customDispatcher = dispatcher;
  }

  getStatus(): ExecutorStatusView {
    return {
      mode: 'local_key_signer',
      mode_label: 'Local Key Signer (Testnet)',
      executor_account_id: this.executorAccountId,
      registry_contract_id: this.chainReader.getRegistryContractId(),
    };
  }

  /**
   * Validates all on-chain grant preconditions (fail-closed), dispatches `execute_payment`
   * to the Registry contract, and reconciles the finalized outcome into the Agent Passport.
   */
  async executeBoundedPayment(
    request: ExecutePaymentRequestDto,
  ): Promise<PaymentExecutionOutcome> {
    if (!request?.token_id || typeof request.token_id !== 'string') {
      throw new BadRequestException('token_id is required');
    }
    if (!request?.recipient || typeof request.recipient !== 'string') {
      throw new BadRequestException('recipient is required');
    }
    this.db.validateYoctoString(request.amount_yocto, 'amount_yocto');
    const amountYocto = BigInt(request.amount_yocto);
    if (amountYocto <= 0n) {
      throw new BadRequestException('amount_yocto must be greater than zero');
    }

    const agent = await this.chainReader.getAgentInfo(request.token_id);

    if (agent.lifecycle !== 'ready' || agent.owner_id === null) {
      throw new ConflictException(
        `Agent ${agent.token_id} is not ready (current lifecycle: ${agent.lifecycle})`,
      );
    }
    const ownerId = agent.owner_id;
    await this.db.upsertAgent(agent);
    if (agent.frozen) {
      throw new ForbiddenException(
        `Agent ${agent.token_id} is frozen by owner`,
      );
    }
    if (agent.pending_operation !== null) {
      throw new ConflictException(
        `Agent ${agent.token_id} already has a pending operation (${agent.pending_operation.operation_id})`,
      );
    }

    if (agent.pending_transfer_call !== null) {
      throw new ConflictException(
        `Agent ${agent.token_id} has an unresolved nft_transfer_call (${agent.pending_transfer_call.operation_id})`,
      );
    }
    if (agent.listing !== null) {
      throw new ConflictException(
        `Agent ${agent.token_id} is listed for sale; outgoing payments are blocked`,
      );
    }

    if (
      request.expected_owner !== undefined &&
      request.expected_owner !== ownerId
    ) {
      throw new ForbiddenException(
        `expected_owner "${request.expected_owner}" does not match current on-chain owner "${ownerId}"`,
      );
    }

    if (
      request.authority_epoch !== undefined &&
      request.authority_epoch !== agent.authority_epoch
    ) {
      throw new ForbiddenException(
        `Stale authority_epoch: requested ${request.authority_epoch}, current on-chain epoch is ${agent.authority_epoch}`,
      );
    }

    if (
      request.nonce !== undefined &&
      request.nonce !== agent.next_command_nonce
    ) {
      throw new ConflictException(
        `Invalid command nonce: requested ${request.nonce}, expected ${agent.next_command_nonce}`,
      );
    }

    const grant = agent.executor_grant;
    if (!grant) {
      throw new ForbiddenException(
        `Agent ${agent.token_id} has no active executor grant`,
      );
    }

    if (grant.executor_id !== this.executorAccountId) {
      throw new ForbiddenException(
        `Executor "${this.executorAccountId}" is not the authorized executor "${grant.executor_id}"`,
      );
    }

    if (grant.epoch !== agent.authority_epoch) {
      throw new ForbiddenException(
        `Grant epoch (${grant.epoch}) does not match current authority_epoch (${agent.authority_epoch})`,
      );
    }

    if (grant.owner_at_grant !== ownerId) {
      throw new ForbiddenException(
        `Grant owner (${grant.owner_at_grant}) does not match current owner (${ownerId})`,
      );
    }

    if (!grant.recipients.includes(request.recipient)) {
      throw new ForbiddenException(
        `Recipient "${request.recipient}" is not in the grant allowlist`,
      );
    }

    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const grantExpiresNs = BigInt(grant.expires_at_ns);
    if (grantExpiresNs <= nowNs) {
      throw new ForbiddenException(
        `Executor grant expired at ${grant.expires_at_ns}`,
      );
    }

    const perPaymentCap = BigInt(grant.per_payment_cap_yocto);
    if (amountYocto > perPaymentCap) {
      throw new ForbiddenException(
        `Amount ${request.amount_yocto} exceeds per-payment cap ${grant.per_payment_cap_yocto}`,
      );
    }

    const remainingBudget = BigInt(grant.remaining_budget_yocto);
    if (amountYocto > remainingBudget) {
      throw new ForbiddenException(
        `Amount ${request.amount_yocto} exceeds remaining grant budget ${grant.remaining_budget_yocto}`,
      );
    }

    const deadlineNs =
      request.deadline_ns ?? (nowNs + DEFAULT_DEADLINE_WINDOW_NS).toString(10);
    this.db.validateYoctoString(deadlineNs, 'deadline_ns');
    if (BigInt(deadlineNs) <= nowNs) {
      throw new BadRequestException('deadline_ns has already passed');
    }

    const contractArgs: ExecutePaymentContractArgs = {
      token_id: agent.token_id,
      expected_owner: ownerId,
      authority_epoch: agent.authority_epoch,
      nonce: agent.next_command_nonce,
      recipient: request.recipient,
      amount: request.amount_yocto,
      deadline_ns: deadlineNs,
    };

    const statusView = this.getStatus();
    const { transaction_hash } =
      await this.dispatchExecutePayment(contractArgs);

    const ingestion = await this.projectionService.ingestTransactionFromChain({
      tokenId: agent.token_id,
      txHash: transaction_hash,
      signerAccountId: this.executorAccountId,
    });

    return {
      token_id: agent.token_id,
      executor_account_id: this.executorAccountId,
      mode: statusView.mode,
      mode_label: statusView.mode_label,
      transaction_hash: ingestion.transaction_hash,
      succeeded: ingestion.succeeded,
      contract_args: contractArgs,
      ingestion: {
        inserted_events: ingestion.inserted_events,
        duplicate_events: ingestion.duplicate_events,
        rejected_events: ingestion.rejected_events,
      },
    };
  }

  private async dispatchExecutePayment(
    args: ExecutePaymentContractArgs,
  ): Promise<{ transaction_hash: string }> {
    const registryContractId = this.chainReader.getRegistryContractId();

    if (this.customDispatcher) {
      return this.customDispatcher({
        registryContractId,
        executorAccountId: this.executorAccountId,
        args,
      });
    }

    throw new BadGatewayException(
      'No active local key transaction signer configured for ExecutorService',
    );
  }
}
