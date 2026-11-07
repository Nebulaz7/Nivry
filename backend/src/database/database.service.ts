import { BadRequestException, Injectable } from '@nestjs/common';
import type { AgentInfoView, Lifecycle, ManifestView } from '../chain/chain-reader.service';

export interface StoredAgentRow {
  token_id: string;
  owner_id: string;
  treasury_account_id: string;
  authority_epoch: number;
  ownership_change_count: number;
  lifecycle: Lifecycle;
  frozen: boolean;
  manifest_hash: string;
  manifest: ManifestView;
  updated_at: string;
}

export interface StoredEventRow {
  id: number;
  block_height: number;
  block_timestamp_ns: string;
  transaction_hash: string;
  receipt_id: string;
  log_index: number;
  token_id: string | null;
  event_standard: string;
  event_version: string;
  event_name: string;
  authority_epoch: number | null;
  category: 'service_payment' | 'owner_deposit' | 'outbound_payout' | 'authority_transition' | 'lifecycle';
  data: Record<string, unknown>;
  created_at: string;
}

export interface StoredOperationProjectionRow {
  operation_id: string;
  token_id: string;
  sequence: number;
  authority_epoch: number;
  kind: 'executor_payment' | 'owner_withdraw';
  recipient: string;
  /** Exact decimal yoctoNEAR string (never JS float) */
  amount_yocto: string;
  status: 'pending' | 'succeeded' | 'failed' | 'uncertain';
  created_at: string;
  settled_at: string | null;
}

export interface StoredTaskRow {
  task_id: string;
  token_id: string;
  task_kind: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

@Injectable()
export class DatabaseService {
  private readonly agents = new Map<string, StoredAgentRow>();
  private readonly eventsByKey = new Map<string, StoredEventRow>();
  private readonly operations = new Map<string, StoredOperationProjectionRow>();
  private readonly tasks = new Map<string, StoredTaskRow>();
  private readonly cursors = new Map<string, number>();
  private nextEventId = 1;

  /**
   * Validates that a yoctoNEAR value is a non-negative decimal integer string (never floating-point).
   */
  validateYoctoString(value: string, fieldName = 'amount_yocto'): void {
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
      throw new BadRequestException(`${fieldName} must be an exact non-negative decimal integer string`);
    }
  }

  upsertAgent(info: AgentInfoView): StoredAgentRow {
    const row: StoredAgentRow = {
      token_id: info.token_id,
      owner_id: info.owner_id,
      treasury_account_id: info.treasury_account_id,
      authority_epoch: info.authority_epoch,
      ownership_change_count: info.ownership_change_count,
      lifecycle: info.lifecycle,
      frozen: info.frozen,
      manifest_hash: info.manifest_hash,
      manifest: info.manifest,
      updated_at: new Date().toISOString(),
    };
    this.agents.set(info.token_id, row);
    return row;
  }

  getAgent(tokenId: string): StoredAgentRow | null {
    return this.agents.get(tokenId) || null;
  }

  listAgents(limit = 50, offset = 0): StoredAgentRow[] {
    const all = Array.from(this.agents.values()).sort((a, b) =>
      a.token_id.localeCompare(b.token_id, undefined, { numeric: true }),
    );
    return all.slice(offset, offset + Math.min(limit, 100));
  }

  /**
   * Inserts a finalized event idempotently by `(receipt_id, log_index)`.
   * Returns `{ inserted: false }` if the receipt log was already processed.
   */
  insertEventIdempotent(input: Omit<StoredEventRow, 'id' | 'created_at'>): {
    inserted: boolean;
    row: StoredEventRow;
  } {
    const uniqueKey = `${input.receipt_id}:${input.log_index}`;
    const existing = this.eventsByKey.get(uniqueKey);
    if (existing) {
      return { inserted: false, row: existing };
    }

    const row: StoredEventRow = {
      ...input,
      id: this.nextEventId++,
      created_at: new Date().toISOString(),
    };
    this.eventsByKey.set(uniqueKey, row);
    return { inserted: true, row };
  }

  listEventsForToken(tokenId: string): StoredEventRow[] {
    return Array.from(this.eventsByKey.values())
      .filter((e) => e.token_id === tokenId)
      .sort((a, b) => a.block_height - b.block_height || a.id - b.id);
  }

  upsertOperationProjection(
    input: Omit<StoredOperationProjectionRow, 'created_at' | 'settled_at'> & {
      settled_at?: string | null;
    },
  ): StoredOperationProjectionRow {
    this.validateYoctoString(input.amount_yocto, 'amount_yocto');
    const existing = this.operations.get(input.operation_id);
    const now = new Date().toISOString();
    const isTerminal = input.status === 'succeeded' || input.status === 'failed';

    const row: StoredOperationProjectionRow = {
      operation_id: input.operation_id,
      token_id: input.token_id,
      sequence: input.sequence,
      authority_epoch: input.authority_epoch,
      kind: input.kind,
      recipient: input.recipient,
      amount_yocto: input.amount_yocto,
      status: input.status,
      created_at: existing?.created_at || now,
      settled_at: input.settled_at !== undefined ? input.settled_at : isTerminal ? now : existing?.settled_at || null,
    };

    this.operations.set(input.operation_id, row);
    return row;
  }

  listOperationsForToken(tokenId: string): StoredOperationProjectionRow[] {
    return Array.from(this.operations.values())
      .filter((op) => op.token_id === tokenId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  createTask(input: {
    task_id: string;
    token_id: string;
    task_kind: string;
    input: Record<string, unknown>;
  }): StoredTaskRow {
    const row: StoredTaskRow = {
      task_id: input.task_id,
      token_id: input.token_id,
      task_kind: input.task_kind,
      status: 'pending',
      input: input.input,
      output: null,
      error_message: null,
      started_at: null,
      completed_at: null,
      created_at: new Date().toISOString(),
    };
    this.tasks.set(input.task_id, row);
    return row;
  }

  /**
   * Atomically claims a pending task if no other task is currently running for the same token.
   */
  claimPendingTask(taskId: string): StoredTaskRow | null {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'pending') {
      return null;
    }

    const activeForToken = Array.from(this.tasks.values()).some(
      (t) => t.token_id === task.token_id && t.status === 'running',
    );
    if (activeForToken) {
      return null;
    }

    task.status = 'running';
    task.started_at = new Date().toISOString();
    return task;
  }

  completeTask(taskId: string, output: Record<string, unknown>): StoredTaskRow | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = 'completed';
    task.output = output;
    task.completed_at = new Date().toISOString();
    return task;
  }

  failTask(taskId: string, errorMessage: string): StoredTaskRow | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = 'failed';
    task.error_message = errorMessage;
    task.completed_at = new Date().toISOString();
    return task;
  }

  getTask(taskId: string): StoredTaskRow | null {
    return this.tasks.get(taskId) || null;
  }

  listTasksForToken(tokenId: string): StoredTaskRow[] {
    return Array.from(this.tasks.values()).filter((t) => t.token_id === tokenId);
  }

  setCursor(sourceName: string, blockHeight: number): void {
    this.cursors.set(sourceName, blockHeight);
  }

  getCursor(sourceName: string): number {
    return this.cursors.get(sourceName) || 0;
  }
}

