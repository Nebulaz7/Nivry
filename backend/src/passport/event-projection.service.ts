import { Injectable } from '@nestjs/common';
import {
  ChainReaderService,
  type AccountLockVerification,
  type AgentInfoView,
  type ParsedNep297Event,
  type TreasuryInfoView,
} from '../verifier/chain-reader.service';
import {
  DatabaseService,
  type StoredEventRow,
  type StoredOperationProjectionRow,
} from '../database/database.service';

export interface EpochHistoryGroup {
  authority_epoch: number;
  events: StoredEventRow[];
  service_payments: StoredEventRow[];
  owner_deposits: StoredEventRow[];
  outbound_operations: StoredOperationProjectionRow[];
}

export interface AgentPassportResponse {
  agent: AgentInfoView;
  treasury: TreasuryInfoView;
  verification: {
    registry: AccountLockVerification;
    treasury: AccountLockVerification;
    published_config_note: string;
  };
  history_by_epoch: EpochHistoryGroup[];
  totals: {
    recorded_service_payment_count: number;
    recorded_service_payment_amount_yocto: string;
    owner_deposit_count: number;
    owner_deposit_amount_yocto: string;
  };
}

@Injectable()
export class EventProjectionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly chainReader: ChainReaderService,
  ) {}

  /**
   * Ingests a single parsed NEP-297 event idempotently (`UNIQUE (receipt_id, log_index)`).
   * Explicitly separates `payment_received` (service payment) from `deposit_received` (owner deposit).
   */
  ingestNep297Event(params: {
    tokenId: string;
    blockHeight: number;
    blockTimestampNs: string;
    transactionHash: string;
    event: ParsedNep297Event;
  }): { inserted: boolean; row: StoredEventRow } {
    const { tokenId, blockHeight, blockTimestampNs, transactionHash, event } = params;
    const payload =
      event.data && typeof event.data === 'object'
        ? (event.data as Record<string, unknown>)
        : { raw: event.data };

    const epochRaw =
      payload.authority_epoch ?? payload.epoch ?? payload.observed_authority_epoch ?? null;
    const authorityEpoch = typeof epochRaw === 'number' ? epochRaw : null;

    let category: StoredEventRow['category'] = 'lifecycle';
    if (event.event === 'payment_received') {
      category = 'service_payment';
      if (typeof payload.amount_yocto === 'string') {
        this.db.validateYoctoString(payload.amount_yocto, 'payment_received.amount_yocto');
      }
    } else if (event.event === 'deposit_received') {
      category = 'owner_deposit';
      if (typeof payload.amount_yocto === 'string') {
        this.db.validateYoctoString(payload.amount_yocto, 'deposit_received.amount_yocto');
      }
    } else if (
      event.event === 'dispatch_initiated' ||
      event.event === 'dispatch_settled' ||
      event.event === 'dispatch_finalized'
    ) {
      category = 'outbound_payout';
    } else if (
      event.event === 'nft_transfer' ||
      event.event === 'executor_set' ||
      event.event === 'executor_revoked' ||
      event.event === 'agent_frozen'
    ) {
      category = 'authority_transition';
    }

    const result = this.db.insertEventIdempotent({
      block_height: blockHeight,
      block_timestamp_ns: blockTimestampNs,
      transaction_hash: transactionHash,
      receipt_id: event.receipt_id,
      log_index: event.log_index,
      token_id: tokenId,
      event_standard: event.standard,
      event_version: event.version,
      event_name: event.event,
      authority_epoch: authorityEpoch,
      category,
      data: payload,
    });

    if (result.inserted && category === 'outbound_payout') {
      this.projectOperationFromEvent(tokenId, event.event, payload);
    }

    return result;
  }

  /**
   * Fetches a finalized transaction from NEAR RPC, ingests all its NEP-297 logs idempotently,
   * and refreshes the authoritative agent record from chain.
   */
  async ingestTransactionFromChain(params: {
    tokenId: string;
    txHash: string;
    signerAccountId: string;
    blockHeight?: number;
    blockTimestampNs?: string;
  }): Promise<{
    transaction_hash: string;
    succeeded: boolean;
    inserted_events: number;
    duplicate_events: number;
  }> {
    const outcome = await this.chainReader.getFinalTransactionOutcome(
      params.txHash,
      params.signerAccountId,
    );

    let insertedCount = 0;
    let duplicateCount = 0;

    for (const ev of outcome.events) {
      const { inserted } = this.ingestNep297Event({
        tokenId: params.tokenId,
        blockHeight: params.blockHeight ?? 0,
        blockTimestampNs: params.blockTimestampNs ?? '0',
        transactionHash: outcome.transaction_hash,
        event: ev,
      });
      if (inserted) {
        insertedCount++;
      } else {
        duplicateCount++;
      }
    }

    const agentInfo = await this.chainReader.getAgentInfo(params.tokenId);
    this.db.upsertAgent(agentInfo);

    return {
      transaction_hash: outcome.transaction_hash,
      succeeded: outcome.succeeded,
      inserted_events: insertedCount,
      duplicate_events: duplicateCount,
    };
  }

  /**
   * Builds the complete Agent Passport combining fresh finalized chain views,
   * keyless lock verification, and epoch-attributed event history (PLAN.md §13, §14).
   */
  async getAgentPassport(tokenId: string): Promise<AgentPassportResponse> {
    const agent = await this.chainReader.getAgentInfo(tokenId);
    this.db.upsertAgent(agent);

    const [treasury, registryLock, treasuryLock] = await Promise.all([
      this.chainReader.getTreasuryInfo(agent.treasury_account_id),
      this.chainReader.verifyAccountLockState(this.chainReader.getRegistryContractId()),
      this.chainReader.verifyAccountLockState(agent.treasury_account_id),
    ]);

    const events = this.db.listEventsForToken(tokenId);
    const operations = this.db.listOperationsForToken(tokenId);

    const epochs = new Set<number>([agent.authority_epoch]);
    for (const ev of events) {
      if (typeof ev.authority_epoch === 'number') {
        epochs.add(ev.authority_epoch);
      }
    }
    for (const op of operations) {
      epochs.add(op.authority_epoch);
    }

    const sortedEpochs = Array.from(epochs).sort((a, b) => a - b);
    const historyByEpoch: EpochHistoryGroup[] = sortedEpochs.map((epoch) => {
      const epochEvents = events.filter((e) => e.authority_epoch === epoch);
      return {
        authority_epoch: epoch,
        events: epochEvents,
        service_payments: epochEvents.filter((e) => e.category === 'service_payment'),
        owner_deposits: epochEvents.filter((e) => e.category === 'owner_deposit'),
        outbound_operations: operations.filter((op) => op.authority_epoch === epoch),
      };
    });

    let totalOwnerDepositsYocto = 0n;
    let ownerDepositCount = 0;

    for (const ev of events) {
      if (ev.category === 'owner_deposit' && typeof ev.data.amount_yocto === 'string') {
        totalOwnerDepositsYocto += BigInt(ev.data.amount_yocto);
        ownerDepositCount++;
      }
    }

    return {
      agent,
      treasury,
      verification: {
        registry: registryLock,
        treasury: treasuryLock,
        published_config_note:
          'Published configuration hash only; not an attestation of live off-chain runtime execution.',
      },
      history_by_epoch: historyByEpoch,
      totals: {
        recorded_service_payment_count: treasury.recorded_payment_count,
        recorded_service_payment_amount_yocto: treasury.recorded_payment_amount_yocto,
        owner_deposit_count: ownerDepositCount,
        owner_deposit_amount_yocto: totalOwnerDepositsYocto.toString(10),
      },
    };
  }

  private projectOperationFromEvent(
    tokenId: string,
    eventName: string,
    payload: Record<string, unknown>,
  ): void {
    const operationId = typeof payload.operation_id === 'string' ? payload.operation_id : null;
    if (!operationId) return;

    const sequence = typeof payload.sequence === 'number' ? payload.sequence : 1;
    const authorityEpoch =
      typeof payload.authority_epoch === 'number'
        ? payload.authority_epoch
        : typeof payload.epoch === 'number'
          ? payload.epoch
          : 1;
    const kind =
      payload.kind === 'owner_withdraw' ? 'owner_withdraw' : 'executor_payment';
    const recipient = typeof payload.recipient === 'string' ? payload.recipient : '';
    const amountYocto =
      typeof payload.amount_yocto === 'string' ? payload.amount_yocto : '0';

    let status: StoredOperationProjectionRow['status'] = 'pending';
    if (eventName === 'dispatch_settled' || eventName === 'dispatch_finalized') {
      if (payload.status === 'succeeded') status = 'succeeded';
      else if (payload.status === 'failed') status = 'failed';
      else status = 'uncertain';
    }

    this.db.upsertOperationProjection({
      operation_id: operationId,
      token_id: tokenId,
      sequence,
      authority_epoch: authorityEpoch,
      kind,
      recipient,
      amount_yocto: amountYocto,
      status,
    });
  }
}

