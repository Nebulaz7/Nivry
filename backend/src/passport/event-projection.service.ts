import { Injectable } from '@nestjs/common';
import {
  ChainReaderService,
  type AccountLockVerification,
  type AgentInfoView,
  type ParsedNep297Event,
  type PendingOperationView,
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

export type EventCategory = StoredEventRow['category'];

export type IngestResult =
  | { outcome: 'inserted'; row: StoredEventRow; note?: string }
  | { outcome: 'duplicate'; row: StoredEventRow }
  | { outcome: 'rejected'; reason: string };

/** The only event standard the Nivry contracts emit (see `emit` in contracts/*). */
const NIVRY_STANDARD = 'nivry';

/** Events emitted by a keyless treasury wallet. They are bound to a token by the emitter account. */
const WALLET_EVENTS: Record<string, EventCategory> = {
  payment_recorded: 'service_payment',
  deposit_received: 'owner_deposit',
  dispatch_queued: 'outbound_payout',
};

/** Events emitted by the registry. They are bound to a token by `data.token_id`. */
const REGISTRY_EVENTS: Record<string, EventCategory> = {
  dispatch_scheduled: 'outbound_payout',
  dispatch_settled: 'outbound_payout',
  dispatch_unproven: 'outbound_payout',
  dispatch_uncertain: 'outbound_payout',
  ownership_changed: 'authority_transition',
  executor_authorized: 'authority_transition',
  executor_revoked: 'authority_transition',
  freeze_changed: 'authority_transition',
  agent_sold: 'authority_transition',
  transfer_call_started: 'authority_transition',
  transfer_call_accepted: 'authority_transition',
  transfer_call_returned: 'authority_transition',
  transfer_call_uncertain: 'authority_transition',
  agent_reserved: 'lifecycle',
  agent_ready: 'lifecycle',
  agent_provisioning_failed: 'lifecycle',
  agent_provisioning_unknown: 'lifecycle',
  agent_provisioning_uncertain: 'lifecycle',
  agent_provisioning_still_uncertain: 'lifecycle',
  agent_listed: 'lifecycle',
  agent_listing_cancelled: 'lifecycle',
};

/** NEAR `U64` values arrive as JSON numbers or decimal strings. Returns null if neither. */
function asUint(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

const isYocto = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9]+$/.test(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

@Injectable()
export class EventProjectionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly chainReader: ChainReaderService,
  ) {}

  /**
   * Validates one parsed NEP-297 event and stores it idempotently (`UNIQUE (receipt_id, log_index)`).
   *
   * Anyone can make any contract print `EVENT_JSON`, so an event is stored only when:
   * - its standard is `nivry`,
   * - the emitting account is the registry or this agent's own treasury,
   * - it belongs to this token (`data.token_id` for registry events, the emitter for wallet events),
   * - every field needed to project it is present and well formed.
   * Anything else is rejected with a reason and never written.
   */
  async ingestNep297Event(params: {
    tokenId: string;
    treasuryAccountId: string;
    pendingOperation?: PendingOperationView | null;
    blockHeight: number;
    blockTimestampNs: string;
    transactionHash: string;
    event: ParsedNep297Event;
  }): Promise<IngestResult> {
    const {
      tokenId,
      treasuryAccountId,
      blockHeight,
      blockTimestampNs,
      transactionHash,
      event,
    } = params;

    if (event.standard !== NIVRY_STANDARD) {
      return {
        outcome: 'rejected',
        reason: `unsupported_standard:${event.standard}`,
      };
    }

    const registryId = this.chainReader.getRegistryContractId();
    const isRegistry = event.executor_id === registryId;
    const isTreasury = event.executor_id === treasuryAccountId;
    if (!isRegistry && !isTreasury) {
      return {
        outcome: 'rejected',
        reason: `foreign_emitter:${event.executor_id}`,
      };
    }

    const category = isRegistry
      ? REGISTRY_EVENTS[event.event]
      : WALLET_EVENTS[event.event];
    if (!category) {
      return {
        outcome: 'rejected',
        reason: `unsupported_event:${event.event}@${event.executor_id}`,
      };
    }

    const payload =
      event.data && typeof event.data === 'object' && !Array.isArray(event.data)
        ? (event.data as Record<string, unknown>)
        : null;
    if (!payload) {
      return { outcome: 'rejected', reason: 'event_data_not_an_object' };
    }

    if (isRegistry && payload.token_id !== tokenId) {
      return { outcome: 'rejected', reason: 'event_for_other_token' };
    }

    const epochRaw =
      payload.authority_epoch ?? payload.observed_authority_epoch;
    let authorityEpoch: number | null = null;
    if (epochRaw !== undefined) {
      authorityEpoch = asUint(epochRaw);
      if (authorityEpoch === null) {
        return { outcome: 'rejected', reason: 'invalid_authority_epoch' };
      }
    }

    if (
      (event.event === 'payment_recorded' ||
        event.event === 'deposit_received') &&
      !isYocto(payload.amount_yocto)
    ) {
      return { outcome: 'rejected', reason: 'invalid_amount_yocto' };
    }
    if (event.event === 'payment_recorded' && authorityEpoch === null) {
      return {
        outcome: 'rejected',
        reason: 'missing_observed_authority_epoch',
      };
    }

    const projection = this.buildOperationStep(
      event.event,
      tokenId,
      payload,
      params.pendingOperation,
    );
    if (projection.kind === 'invalid') {
      return { outcome: 'rejected', reason: projection.reason };
    }

    const result = await this.db.insertEventIdempotent({
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

    if (!result.inserted) {
      return { outcome: 'duplicate', row: result.row };
    }

    let note: string | undefined;
    if (projection.kind === 'upsert') {
      await this.db.upsertOperationProjection(projection.row);
    } else if (projection.kind === 'settle') {
      const settled = await this.db.settleOperation(
        projection.operationId,
        tokenId,
        projection.status,
      );
      if (!settled) note = 'settlement_without_projection';
    }

    return note
      ? { outcome: 'inserted', row: result.row, note }
      : { outcome: 'inserted', row: result.row };
  }

  /**
   * Fetches a finalized transaction from NEAR RPC and ingests the events that belong to `tokenId`.
   * Block height and timestamp come from the chain, never from the caller.
   */
  async ingestTransactionFromChain(params: {
    tokenId: string;
    txHash: string;
    signerAccountId: string;
  }): Promise<{
    transaction_hash: string;
    succeeded: boolean;
    inserted_events: number;
    duplicate_events: number;
    rejected_events: Array<{
      receipt_id: string;
      log_index: number;
      reason: string;
    }>;
  }> {
    const agentInfo = await this.chainReader.getAgentInfo(params.tokenId);
    await this.db.upsertAgent(agentInfo);

    const outcome = await this.chainReader.getFinalTransactionOutcome(
      params.txHash,
      params.signerAccountId,
    );

    const blocks = new Map<string, { height: number; timestamp_ns: string }>();
    let insertedCount = 0;
    let duplicateCount = 0;
    const rejected: Array<{
      receipt_id: string;
      log_index: number;
      reason: string;
    }> = [];

    for (const ev of outcome.events) {
      let block = blocks.get(ev.block_hash);
      if (!block) {
        block = await this.chainReader.getBlockInfo(ev.block_hash);
        blocks.set(ev.block_hash, block);
      }

      const result = await this.ingestNep297Event({
        tokenId: params.tokenId,
        treasuryAccountId: agentInfo.treasury_account_id,
        pendingOperation: agentInfo.pending_operation,
        blockHeight: block.height,
        blockTimestampNs: block.timestamp_ns,
        transactionHash: outcome.transaction_hash,
        event: ev,
      });

      if (result.outcome === 'inserted') insertedCount++;
      else if (result.outcome === 'duplicate') duplicateCount++;
      else
        rejected.push({
          receipt_id: ev.receipt_id,
          log_index: ev.log_index,
          reason: result.reason,
        });
    }

    return {
      transaction_hash: outcome.transaction_hash,
      succeeded: outcome.succeeded,
      inserted_events: insertedCount,
      duplicate_events: duplicateCount,
      rejected_events: rejected,
    };
  }

  /**
   * Builds the complete Agent Passport combining fresh finalized chain views,
   * keyless lock verification, and epoch-attributed event history (PLAN.md §13, §14).
   */
  async getAgentPassport(tokenId: string): Promise<AgentPassportResponse> {
    const agent = await this.chainReader.getAgentInfo(tokenId);
    await this.db.upsertAgent(agent);

    const [treasury, registryLock, treasuryLock] = await Promise.all([
      this.chainReader.getTreasuryInfo(agent.treasury_account_id),
      this.chainReader.verifyAccountLockState(
        this.chainReader.getRegistryContractId(),
      ),
      this.chainReader.verifyAccountLockState(agent.treasury_account_id),
    ]);

    const events = await this.db.listEventsForToken(tokenId);
    const operations = await this.db.listOperationsForToken(tokenId);

    // Some contract events (for example `deposit_received`) carry no epoch. They belong to the
    // epoch in force when they happened, which is the last epoch seen earlier in chain order.
    const effectiveEpoch = new Map<number, number>();
    let carried: number | null = null;
    for (const ev of events) {
      if (typeof ev.authority_epoch === 'number') carried = ev.authority_epoch;
      effectiveEpoch.set(ev.id, carried ?? agent.authority_epoch);
    }
    // Events before the first epoch-bearing event take that first epoch, not the current one.
    const firstKnown = events.find(
      (e) => typeof e.authority_epoch === 'number',
    )?.authority_epoch;
    if (firstKnown !== undefined && firstKnown !== null) {
      for (const ev of events) {
        if (typeof ev.authority_epoch === 'number') break;
        effectiveEpoch.set(ev.id, firstKnown);
      }
    }

    const epochs = new Set<number>([agent.authority_epoch]);
    for (const ev of events) epochs.add(effectiveEpoch.get(ev.id)!);
    for (const op of operations) epochs.add(op.authority_epoch);

    const sortedEpochs = Array.from(epochs).sort((a, b) => a - b);
    const historyByEpoch: EpochHistoryGroup[] = sortedEpochs.map((epoch) => {
      const epochEvents = events.filter(
        (e) => effectiveEpoch.get(e.id) === epoch,
      );
      return {
        authority_epoch: epoch,
        events: epochEvents,
        service_payments: epochEvents.filter(
          (e) => e.category === 'service_payment',
        ),
        owner_deposits: epochEvents.filter(
          (e) => e.category === 'owner_deposit',
        ),
        outbound_operations: operations.filter(
          (op) => op.authority_epoch === epoch,
        ),
      };
    });

    let totalOwnerDepositsYocto = 0n;
    let ownerDepositCount = 0;

    for (const ev of events) {
      if (
        ev.category === 'owner_deposit' &&
        typeof ev.data.amount_yocto === 'string'
      ) {
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
        recorded_service_payment_amount_yocto:
          treasury.recorded_payment_amount_yocto,
        owner_deposit_count: ownerDepositCount,
        owner_deposit_amount_yocto: totalOwnerDepositsYocto.toString(10),
      },
    };
  }

  /**
   * Decides how an event changes the operation projection. Never invents missing fields:
   * an operation event without its required fields is invalid.
   */
  private buildOperationStep(
    eventName: string,
    tokenId: string,
    payload: Record<string, unknown>,
    pendingOperation?: PendingOperationView | null,
  ):
    | { kind: 'none' }
    | { kind: 'invalid'; reason: string }
    | {
        kind: 'upsert';
        row: Omit<StoredOperationProjectionRow, 'created_at' | 'settled_at'>;
      }
    | {
        kind: 'settle';
        operationId: string;
        status: StoredOperationProjectionRow['status'];
      } {
    if (eventName === 'dispatch_scheduled' || eventName === 'dispatch_queued') {
      const sequence = asUint(
        eventName === 'dispatch_scheduled' ? payload.nonce : payload.sequence,
      );
      const epoch = asUint(payload.authority_epoch);
      if (
        !nonEmptyString(payload.operation_id) ||
        sequence === null ||
        epoch === null ||
        !nonEmptyString(payload.recipient) ||
        !isYocto(payload.amount_yocto)
      ) {
        return { kind: 'invalid', reason: `incomplete_${eventName}` };
      }
      const kind =
        pendingOperation &&
        pendingOperation.operation_id === payload.operation_id
          ? pendingOperation.kind
          : 'unknown';
      return {
        kind: 'upsert',
        row: {
          operation_id: payload.operation_id,
          token_id: tokenId,
          sequence,
          authority_epoch: epoch,
          kind,
          recipient: payload.recipient,
          amount_yocto: payload.amount_yocto,
          status: 'pending',
        },
      };
    }

    if (eventName === 'dispatch_settled') {
      if (!nonEmptyString(payload.operation_id)) {
        return { kind: 'invalid', reason: 'incomplete_dispatch_settled' };
      }
      if (payload.status === 'succeeded') {
        return {
          kind: 'settle',
          operationId: payload.operation_id,
          status: 'succeeded',
        };
      }
      // `failed` and `not_dispatched` both mean no value left the treasury.
      if (payload.status === 'failed' || payload.status === 'not_dispatched') {
        return {
          kind: 'settle',
          operationId: payload.operation_id,
          status: 'failed',
        };
      }
      return { kind: 'invalid', reason: 'unknown_dispatch_settled_status' };
    }

    if (eventName === 'dispatch_uncertain') {
      if (!nonEmptyString(payload.operation_id)) {
        return { kind: 'invalid', reason: 'incomplete_dispatch_uncertain' };
      }
      return {
        kind: 'settle',
        operationId: payload.operation_id,
        status: 'uncertain',
      };
    }

    return { kind: 'none' };
  }
}
