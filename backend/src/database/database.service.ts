import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';
import type {
  AgentInfoView,
  Lifecycle,
  ManifestView,
} from '../verifier/chain-reader.service';

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
  category:
    | 'service_payment'
    | 'owner_deposit'
    | 'outbound_payout'
    | 'authority_transition'
    | 'lifecycle';
  data: Record<string, unknown>;
  created_at: string;
}

export interface StoredOperationProjectionRow {
  operation_id: string;
  token_id: string;
  sequence: number;
  authority_epoch: number;
  /** `unknown` means the on-chain events seen so far did not reveal the operation kind. */
  kind: 'executor_payment' | 'owner_withdraw' | 'unknown';
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

const DEFAULT_DATABASE_URL =
  'postgres://nivry:nivry_dev_password@127.0.0.1:5432/nivry';

type Row = Record<string, unknown>;

const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value);
const isoOrNull = (value: unknown): string | null =>
  value == null ? null : iso(value);

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;
  private schemaReadyPromise: Promise<void> | null = null;

  // In-memory store used when running unit tests without TEST_DATABASE_URL
  private readonly memAgents = new Map<string, StoredAgentRow>();
  private readonly memEventsByKey = new Map<string, StoredEventRow>();
  private readonly memOperations = new Map<
    string,
    StoredOperationProjectionRow
  >();
  private readonly memTasks = new Map<string, StoredTaskRow>();
  private readonly memCursors = new Map<string, number>();
  private nextEventId = 1;

  constructor() {
    const useInMemoryTestStore =
      process.env.NODE_ENV === 'test' && !process.env.TEST_DATABASE_URL;

    if (useInMemoryTestStore) {
      this.pool = null;
    } else {
      this.pool = new Pool({
        connectionString:
          process.env.TEST_DATABASE_URL ||
          process.env.DATABASE_URL ||
          DEFAULT_DATABASE_URL,
        max: 10,
      });
    }
  }

  private ensureSchema(): Promise<void> {
    if (!this.pool) {
      return Promise.resolve();
    }
    if (!this.schemaReadyPromise) {
      this.schemaReadyPromise = this.pool
        .query(
          `ALTER TABLE events ADD COLUMN IF NOT EXISTS category VARCHAR(32) NOT NULL DEFAULT 'lifecycle';
           CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_one_running_per_token ON tasks (token_id) WHERE status = 'running';`,
        )
        .then(() => undefined);
    }
    return this.schemaReadyPromise;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Validates that a yoctoNEAR value is a non-negative decimal integer string (never floating-point).
   */
  validateYoctoString(value: string, fieldName = 'amount_yocto'): void {
    if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
      throw new BadRequestException(
        `${fieldName} must be an exact non-negative decimal integer string`,
      );
    }
  }

  /** Test-only helper: empties every table. Refuses to run outside `NODE_ENV=test`. */
  async resetForTests(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('resetForTests is only allowed when NODE_ENV=test');
    }
    if (!this.pool) {
      this.memAgents.clear();
      this.memEventsByKey.clear();
      this.memOperations.clear();
      this.memTasks.clear();
      this.memCursors.clear();
      this.nextEventId = 1;
      return;
    }
    await this.ensureSchema();
    await this.pool.query(
      'TRUNCATE agents, events, operation_projections, tasks, ingestion_cursors RESTART IDENTITY',
    );
  }

  // ---- agents -----------------------------------------------------------

  /**
   * Inserts or refreshes an agent snapshot. A snapshot with a lower authority epoch than the
   * stored one is ignored so a stale read can never roll ownership back.
   */
  async upsertAgent(info: AgentInfoView): Promise<StoredAgentRow> {
    if (!this.pool) {
      const existing = this.memAgents.get(info.token_id);
      if (existing && existing.authority_epoch > info.authority_epoch) {
        return existing;
      }
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
      this.memAgents.set(info.token_id, row);
      return row;
    }

    const { rows } = await this.pool.query<Row>(
      `INSERT INTO agents (token_id, owner_id, treasury_account_id, authority_epoch,
         ownership_change_count, lifecycle, frozen, manifest_hash, manifest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (token_id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         treasury_account_id = EXCLUDED.treasury_account_id,
         authority_epoch = EXCLUDED.authority_epoch,
         ownership_change_count = EXCLUDED.ownership_change_count,
         lifecycle = EXCLUDED.lifecycle,
         frozen = EXCLUDED.frozen,
         manifest_hash = EXCLUDED.manifest_hash,
         manifest = EXCLUDED.manifest,
         updated_at = NOW()
       WHERE agents.authority_epoch <= EXCLUDED.authority_epoch
       RETURNING *`,
      [
        info.token_id,
        info.owner_id,
        info.treasury_account_id,
        info.authority_epoch,
        info.ownership_change_count,
        info.lifecycle,
        info.frozen,
        info.manifest_hash,
        JSON.stringify(info.manifest),
      ],
    );
    if (rows[0]) return this.toAgent(rows[0]);
    return (await this.getAgent(info.token_id))!;
  }

  async getAgent(tokenId: string): Promise<StoredAgentRow | null> {
    if (!this.pool) {
      return this.memAgents.get(tokenId) || null;
    }
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM agents WHERE token_id = $1',
      [tokenId],
    );
    return rows[0] ? this.toAgent(rows[0]) : null;
  }

  async listAgents(limit = 50, offset = 0): Promise<StoredAgentRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const safeOffset = Math.max(0, offset);
    if (!this.pool) {
      const all = Array.from(this.memAgents.values()).sort((a, b) =>
        a.token_id.localeCompare(b.token_id, undefined, { numeric: true }),
      );
      return all.slice(safeOffset, safeOffset + safeLimit);
    }
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM agents ORDER BY LENGTH(token_id), token_id LIMIT $1 OFFSET $2',
      [safeLimit, safeOffset],
    );
    return rows.map((r) => this.toAgent(r));
  }

  // ---- events -----------------------------------------------------------

  /**
   * Inserts a finalized event idempotently by `(receipt_id, log_index)`.
   * Returns `{ inserted: false }` if the receipt log was already processed.
   */
  async insertEventIdempotent(
    input: Omit<StoredEventRow, 'id' | 'created_at'>,
  ): Promise<{
    inserted: boolean;
    row: StoredEventRow;
  }> {
    if (!this.pool) {
      const uniqueKey = `${input.receipt_id}:${input.log_index}`;
      const existing = this.memEventsByKey.get(uniqueKey);
      if (existing) {
        return { inserted: false, row: existing };
      }
      const row: StoredEventRow = {
        ...input,
        id: this.nextEventId++,
        created_at: new Date().toISOString(),
      };
      this.memEventsByKey.set(uniqueKey, row);
      return { inserted: true, row };
    }

    await this.ensureSchema();
    const inserted = await this.pool.query<Row>(
      `INSERT INTO events (block_height, block_timestamp_ns, transaction_hash, receipt_id, log_index,
         token_id, event_standard, event_version, event_name, authority_epoch, category, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (receipt_id, log_index) DO NOTHING
       RETURNING *`,
      [
        input.block_height,
        input.block_timestamp_ns,
        input.transaction_hash,
        input.receipt_id,
        input.log_index,
        input.token_id,
        input.event_standard,
        input.event_version,
        input.event_name,
        input.authority_epoch,
        input.category,
        JSON.stringify(input.data),
      ],
    );
    if (inserted.rows[0]) {
      return { inserted: true, row: this.toEvent(inserted.rows[0]) };
    }
    const existing = await this.pool.query<Row>(
      'SELECT * FROM events WHERE receipt_id = $1 AND log_index = $2',
      [input.receipt_id, input.log_index],
    );
    return { inserted: false, row: this.toEvent(existing.rows[0]) };
  }

  async listEventsForToken(tokenId: string): Promise<StoredEventRow[]> {
    if (!this.pool) {
      return Array.from(this.memEventsByKey.values())
        .filter((e) => e.token_id === tokenId)
        .sort((a, b) => a.block_height - b.block_height || a.id - b.id);
    }
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM events WHERE token_id = $1 ORDER BY block_height, id',
      [tokenId],
    );
    return rows.map((r) => this.toEvent(r));
  }

  // ---- operations -------------------------------------------------------

  async upsertOperationProjection(
    input: Omit<StoredOperationProjectionRow, 'created_at' | 'settled_at'> & {
      settled_at?: string | null;
    },
  ): Promise<StoredOperationProjectionRow> {
    this.validateYoctoString(input.amount_yocto, 'amount_yocto');
    const isTerminal =
      input.status === 'succeeded' || input.status === 'failed';

    if (!this.pool) {
      const existing = this.memOperations.get(input.operation_id);
      const now = new Date().toISOString();
      const existingTerminal =
        existing &&
        (existing.status === 'succeeded' || existing.status === 'failed');
      const row: StoredOperationProjectionRow = {
        operation_id: input.operation_id,
        token_id: input.token_id,
        sequence: input.sequence,
        authority_epoch: input.authority_epoch,
        kind: existing && input.kind === 'unknown' ? existing.kind : input.kind,
        recipient: input.recipient,
        amount_yocto: input.amount_yocto,
        status: existingTerminal ? existing.status : input.status,
        created_at: existing?.created_at || now,
        settled_at:
          existing?.settled_at ??
          (input.settled_at !== undefined
            ? input.settled_at
            : isTerminal
              ? now
              : null),
      };
      this.memOperations.set(input.operation_id, row);
      return row;
    }

    const { rows } = await this.pool.query<Row>(
      `INSERT INTO operation_projections (operation_id, token_id, sequence, authority_epoch, kind,
         recipient, amount_yocto, status, settled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $9::boolean THEN COALESCE($10::timestamptz, NOW()) ELSE $10::timestamptz END)
       ON CONFLICT (operation_id) DO UPDATE SET
         token_id = EXCLUDED.token_id,
         sequence = EXCLUDED.sequence,
         authority_epoch = EXCLUDED.authority_epoch,
         kind = CASE WHEN EXCLUDED.kind = 'unknown' THEN operation_projections.kind ELSE EXCLUDED.kind END,
         recipient = EXCLUDED.recipient,
         amount_yocto = EXCLUDED.amount_yocto,
         status = CASE WHEN operation_projections.status IN ('succeeded','failed')
                       THEN operation_projections.status ELSE EXCLUDED.status END,
         settled_at = COALESCE(operation_projections.settled_at, EXCLUDED.settled_at)
       RETURNING *`,
      [
        input.operation_id,
        input.token_id,
        input.sequence,
        input.authority_epoch,
        input.kind,
        input.recipient,
        input.amount_yocto,
        input.status,
        isTerminal,
        input.settled_at ?? null,
      ],
    );
    return this.toOperation(rows[0]);
  }

  /**
   * Applies a terminal or uncertain status to an operation that was already projected.
   * Returns null if the operation has not been seen yet.
   */
  async settleOperation(
    operationId: string,
    tokenId: string,
    status: StoredOperationProjectionRow['status'],
  ): Promise<StoredOperationProjectionRow | null> {
    const isTerminal = status === 'succeeded' || status === 'failed';
    if (!this.pool) {
      const existing = this.memOperations.get(operationId);
      if (!existing || existing.token_id !== tokenId) {
        return null;
      }
      if (existing.status !== 'succeeded' && existing.status !== 'failed') {
        existing.status = status;
        if (isTerminal && !existing.settled_at) {
          existing.settled_at = new Date().toISOString();
        }
      }
      return existing;
    }

    const { rows } = await this.pool.query<Row>(
      `UPDATE operation_projections
       SET status = $3,
           settled_at = CASE WHEN $4::boolean THEN COALESCE(settled_at, NOW()) ELSE settled_at END
       WHERE operation_id = $1 AND token_id = $2 AND status NOT IN ('succeeded','failed')
       RETURNING *`,
      [operationId, tokenId, status, isTerminal],
    );
    if (rows[0]) return this.toOperation(rows[0]);
    const existing = await this.pool.query<Row>(
      'SELECT * FROM operation_projections WHERE operation_id = $1 AND token_id = $2',
      [operationId, tokenId],
    );
    return existing.rows[0] ? this.toOperation(existing.rows[0]) : null;
  }

  async getOperation(
    operationId: string,
  ): Promise<StoredOperationProjectionRow | null> {
    if (!this.pool) {
      return this.memOperations.get(operationId) || null;
    }
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM operation_projections WHERE operation_id = $1',
      [operationId],
    );
    return rows[0] ? this.toOperation(rows[0]) : null;
  }

  async listOperationsForToken(
    tokenId: string,
  ): Promise<StoredOperationProjectionRow[]> {
    if (!this.pool) {
      return Array.from(this.memOperations.values())
        .filter((op) => op.token_id === tokenId)
        .sort((a, b) => a.sequence - b.sequence);
    }
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM operation_projections WHERE token_id = $1 ORDER BY sequence',
      [tokenId],
    );
    return rows.map((r) => this.toOperation(r));
  }

  // ---- tasks ------------------------------------------------------------

  async createTask(input: {
    task_id: string;
    token_id: string;
    task_kind: string;
    input: Record<string, unknown>;
  }): Promise<StoredTaskRow> {
    if (!this.pool) {
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
      this.memTasks.set(input.task_id, row);
      return row;
    }
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO tasks (task_id, token_id, task_kind, status, input)
       VALUES ($1,$2,$3,'pending',$4) RETURNING *`,
      [
        input.task_id,
        input.token_id,
        input.task_kind,
        JSON.stringify(input.input),
      ],
    );
    return this.toTask(rows[0]);
  }

  /**
   * Atomically claims a pending task if no other task is currently running for the same token.
   * The partial unique index `uq_tasks_one_running_per_token` closes the race between two claimers.
   */
  async claimPendingTask(taskId: string): Promise<StoredTaskRow | null> {
    if (!this.pool) {
      const task = this.memTasks.get(taskId);
      if (!task || task.status !== 'pending') {
        return null;
      }
      const activeForToken = Array.from(this.memTasks.values()).some(
        (t) => t.token_id === task.token_id && t.status === 'running',
      );
      if (activeForToken) {
        return null;
      }
      task.status = 'running';
      task.started_at = new Date().toISOString();
      return task;
    }

    await this.ensureSchema();
    try {
      const { rows } = await this.pool.query<Row>(
        `UPDATE tasks SET status = 'running', started_at = NOW()
         WHERE task_id = $1 AND status = 'pending'
           AND NOT EXISTS (
             SELECT 1 FROM tasks t2 WHERE t2.token_id = tasks.token_id AND t2.status = 'running'
           )
         RETURNING *`,
        [taskId],
      );
      return rows[0] ? this.toTask(rows[0]) : null;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return null;
      throw err;
    }
  }

  async completeTask(
    taskId: string,
    output: Record<string, unknown>,
  ): Promise<StoredTaskRow | null> {
    if (!this.pool) {
      const task = this.memTasks.get(taskId);
      if (!task) return null;
      if (task.status === 'running') {
        task.status = 'completed';
        task.output = output;
        task.completed_at = new Date().toISOString();
      }
      return task;
    }
    const { rows } = await this.pool.query<Row>(
      `UPDATE tasks SET status = 'completed', output = $2, completed_at = NOW()
       WHERE task_id = $1 AND status = 'running' RETURNING *`,
      [taskId, JSON.stringify(output)],
    );
    return rows[0] ? this.toTask(rows[0]) : this.getTask(taskId);
  }

  async failTask(
    taskId: string,
    errorMessage: string,
  ): Promise<StoredTaskRow | null> {
    if (!this.pool) {
      const task = this.memTasks.get(taskId);
      if (!task) return null;
      if (task.status === 'running') {
        task.status = 'failed';
        task.error_message = errorMessage;
        task.completed_at = new Date().toISOString();
      }
      return task;
    }
    const { rows } = await this.pool.query<Row>(
      `UPDATE tasks SET status = 'failed', error_message = $2, completed_at = NOW()
       WHERE task_id = $1 AND status = 'running' RETURNING *`,
      [taskId, errorMessage],
    );
    return rows[0] ? this.toTask(rows[0]) : this.getTask(taskId);
  }

  async cancelTask(taskId: string): Promise<StoredTaskRow | null> {
    if (!this.pool) {
      const task = this.memTasks.get(taskId);
      if (!task) return null;
      if (task.status === 'pending' || task.status === 'running') {
        task.status = 'cancelled';
        task.completed_at = new Date().toISOString();
      }
      return task;
    }
    const { rows } = await this.pool.query<Row>(
      `UPDATE tasks SET status = 'cancelled', completed_at = NOW()
       WHERE task_id = $1 AND status IN ('pending','running') RETURNING *`,
      [taskId],
    );
    return rows[0] ? this.toTask(rows[0]) : this.getTask(taskId);
  }

  async getTask(taskId: string): Promise<StoredTaskRow | null> {
    if (!this.pool) {
      return this.memTasks.get(taskId) || null;
    }
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM tasks WHERE task_id = $1',
      [taskId],
    );
    return rows[0] ? this.toTask(rows[0]) : null;
  }

  async listTasksForToken(tokenId: string): Promise<StoredTaskRow[]> {
    if (!this.pool) {
      return Array.from(this.memTasks.values()).filter(
        (t) => t.token_id === tokenId,
      );
    }
    const { rows } = await this.pool.query<Row>(
      'SELECT * FROM tasks WHERE token_id = $1 ORDER BY created_at',
      [tokenId],
    );
    return rows.map((r) => this.toTask(r));
  }

  // ---- cursors ----------------------------------------------------------

  async setCursor(sourceName: string, blockHeight: number): Promise<void> {
    if (!this.pool) {
      const prev = this.memCursors.get(sourceName) ?? 0;
      this.memCursors.set(sourceName, Math.max(prev, blockHeight));
      return;
    }
    await this.pool.query(
      `INSERT INTO ingestion_cursors (source_name, last_processed_block_height)
       VALUES ($1,$2)
       ON CONFLICT (source_name) DO UPDATE SET
         last_processed_block_height = GREATEST(ingestion_cursors.last_processed_block_height, EXCLUDED.last_processed_block_height),
         updated_at = NOW()`,
      [sourceName, blockHeight],
    );
  }

  async getCursor(sourceName: string): Promise<number> {
    if (!this.pool) {
      return this.memCursors.get(sourceName) || 0;
    }
    const { rows } = await this.pool.query<{
      last_processed_block_height: string | number;
    }>(
      'SELECT last_processed_block_height FROM ingestion_cursors WHERE source_name = $1',
      [sourceName],
    );
    return rows[0] ? Number(rows[0].last_processed_block_height) : 0;
  }

  // ---- row mappers (pg returns BIGINT/NUMERIC as strings and TIMESTAMPTZ as Date) ----

  private toAgent(r: Row): StoredAgentRow {
    return {
      token_id: r.token_id as string,
      owner_id: r.owner_id as string,
      treasury_account_id: r.treasury_account_id as string,
      authority_epoch: Number(r.authority_epoch),
      ownership_change_count: Number(r.ownership_change_count),
      lifecycle: r.lifecycle as Lifecycle,
      frozen: r.frozen as boolean,
      manifest_hash: r.manifest_hash as string,
      manifest: r.manifest as ManifestView,
      updated_at: iso(r.updated_at),
    };
  }

  private toEvent(r: Row): StoredEventRow {
    return {
      id: Number(r.id),
      block_height: Number(r.block_height),
      block_timestamp_ns: String(r.block_timestamp_ns),
      transaction_hash: r.transaction_hash as string,
      receipt_id: r.receipt_id as string,
      log_index: Number(r.log_index),
      token_id: (r.token_id as string | null) ?? null,
      event_standard: r.event_standard as string,
      event_version: r.event_version as string,
      event_name: r.event_name as string,
      authority_epoch:
        r.authority_epoch == null ? null : Number(r.authority_epoch),
      category: r.category as StoredEventRow['category'],
      data: r.data as Record<string, unknown>,
      created_at: iso(r.created_at),
    };
  }

  private toOperation(r: Row): StoredOperationProjectionRow {
    return {
      operation_id: r.operation_id as string,
      token_id: r.token_id as string,
      sequence: Number(r.sequence),
      authority_epoch: Number(r.authority_epoch),
      kind: r.kind as StoredOperationProjectionRow['kind'],
      recipient: r.recipient as string,
      amount_yocto: String(r.amount_yocto),
      status: r.status as StoredOperationProjectionRow['status'],
      created_at: iso(r.created_at),
      settled_at: isoOrNull(r.settled_at),
    };
  }

  private toTask(r: Row): StoredTaskRow {
    return {
      task_id: r.task_id as string,
      token_id: r.token_id as string,
      task_kind: r.task_kind as string,
      status: r.status as StoredTaskRow['status'],
      input: r.input as Record<string, unknown>,
      output: (r.output as Record<string, unknown> | null) ?? null,
      error_message: (r.error_message as string | null) ?? null,
      started_at: isoOrNull(r.started_at),
      completed_at: isoOrNull(r.completed_at),
      created_at: iso(r.created_at),
    };
  }
}
