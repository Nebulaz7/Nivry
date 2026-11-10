import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  DatabaseService,
  type StoredTaskRow,
} from '../database/database.service';

export const SUPPORTED_TASK_KIND = 'docs_report_v1';
export const MAX_TASK_FILES = 50;
export const MAX_TASK_FILE_BYTES = 256 * 1024;
export const DEFAULT_TASK_TIMEOUT_MS = 15_000;

export interface SubmitTaskInput {
  token_id: string;
  task_kind: string;
  fixture_subpath?: string;
}

export interface DocsReportOutput {
  task_kind: 'docs_report_v1';
  files_analyzed: string[];
  summary: string;
  report_markdown: string;
  output_sha256: string;
  generated_at: string;
}

@Injectable()
export class TaskRunnerService {
  private readonly fixturesRoot: string;

  constructor(private readonly db: DatabaseService) {
    this.fixturesRoot = resolve(__dirname, '../../../fixtures');
  }

  /**
   * Validates and enqueues a bounded `docs_report_v1` task, then executes it if no other
   * task is currently running for the same token.
   */
  async submitAndRunTask(input: SubmitTaskInput): Promise<StoredTaskRow> {
    if (
      !input?.token_id ||
      typeof input.token_id !== 'string' ||
      input.token_id.length > 64
    ) {
      throw new BadRequestException(
        'Valid token_id (1..=64 bytes) is required',
      );
    }
    if (input.task_kind !== SUPPORTED_TASK_KIND) {
      throw new BadRequestException(
        `Unsupported task_kind "${input.task_kind}". Only "${SUPPORTED_TASK_KIND}" is supported in MVP`,
      );
    }

    const fixtureSubpath = input.fixture_subpath || 'sample-repo';
    const targetDir = this.resolveAllowlistedFixtureDir(fixtureSubpath);

    const existingRunning = (
      await this.db.listTasksForToken(input.token_id)
    ).some((t) => t.status === 'running');
    if (existingRunning) {
      throw new ConflictException(
        `Agent token ${input.token_id} already has a running task`,
      );
    }

    const taskId = `task_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    await this.db.createTask({
      task_id: taskId,
      token_id: input.token_id,
      task_kind: SUPPORTED_TASK_KIND,
      input: {
        fixture_subpath: fixtureSubpath,
      },
    });

    const claimed = await this.db.claimPendingTask(taskId);
    if (!claimed) {
      await this.db.cancelTask(taskId);
      throw new ConflictException(
        `Could not claim task ${taskId} for token ${input.token_id}`,
      );
    }

    try {
      const output = await this.runWithTimeout(
        () => Promise.resolve(this.executeHermesDocsReport(targetDir)),
        DEFAULT_TASK_TIMEOUT_MS,
      );
      return (await this.db.completeTask(
        taskId,
        output as unknown as Record<string, unknown>,
      ))!;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return (await this.db.failTask(taskId, message))!;
    }
  }

  async getTask(taskId: string): Promise<StoredTaskRow> {
    const row = await this.db.getTask(taskId);
    if (!row) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    return row;
  }

  async cancelTask(taskId: string): Promise<StoredTaskRow> {
    const row = await this.getTask(taskId);
    if (row.status === 'completed' || row.status === 'failed') {
      throw new BadRequestException(
        `Cannot cancel terminal task in status "${row.status}"`,
      );
    }
    return (await this.db.cancelTask(taskId))!;
  }

  /**
   * Ensures input points strictly inside the local `fixtures/` directory and rejects
   * URLs, shell characters, or path traversal (`PLAN.md` §1, §12, §13).
   */
  resolveAllowlistedFixtureDir(subpath: string): string {
    if (
      typeof subpath !== 'string' ||
      subpath.length === 0 ||
      subpath.includes('..') ||
      subpath.includes('://') ||
      subpath.startsWith('/') ||
      !/^[a-zA-Z0-9._/-]+$/.test(subpath)
    ) {
      throw new BadRequestException(
        'Invalid fixture_subpath: only allowlisted relative fixture directories are permitted',
      );
    }

    const targetDir = resolve(this.fixturesRoot, subpath);
    if (!targetDir.startsWith(this.fixturesRoot)) {
      throw new BadRequestException(
        'Fixture path escapes allowlisted fixtures root',
      );
    }
    if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
      throw new BadRequestException(`Fixture directory not found: ${subpath}`);
    }

    return targetDir;
  }

  /**
   * Executes the bounded Hermes documentation report task deterministically.
   */
  executeHermesDocsReport(targetDir: string): DocsReportOutput {
    const entries = readdirSync(targetDir).sort();
    if (entries.length > MAX_TASK_FILES) {
      throw new BadRequestException(
        `Fixture directory exceeds max file limit (${MAX_TASK_FILES})`,
      );
    }

    const filesAnalyzed: string[] = [];
    const sections: Array<{
      file: string;
      bytes: number;
      lines: number;
      exports: string[];
    }> = [];

    for (const name of entries) {
      if (name.startsWith('.')) continue;
      const fullPath = join(targetDir, name);
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      if (stat.size > MAX_TASK_FILE_BYTES) {
        throw new BadRequestException(`File ${name} exceeds max size limit`);
      }

      const relPath = relative(targetDir, fullPath);
      filesAnalyzed.push(relPath);

      const content = readFileSync(fullPath, 'utf8');
      const exportedFns = Array.from(
        content.matchAll(/export\s+function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g),
      ).map((m) => `${m[1]}(${m[2].trim()})`);

      sections.push({
        file: relPath,
        bytes: stat.size,
        lines: content.split(/\r?\n/).length,
        exports: exportedFns,
      });
    }

    const reportLines: string[] = [
      '# Repository Documentation Report (`docs_report_v1`)',
      '',
      `Files Analyzed: ${filesAnalyzed.length}`,
      '',
      '## File Breakdown',
    ];

    for (const s of sections) {
      reportLines.push(
        `### \`${s.file}\` (${s.lines} lines, ${s.bytes} bytes)`,
      );
      if (s.exports.length > 0) {
        reportLines.push('- Exported functions:');
        for (const fn of s.exports) {
          reportLines.push(`  - \`${fn}\``);
        }
      } else {
        reportLines.push('- Documentation / static file');
      }
      reportLines.push('');
    }

    const reportMarkdown = reportLines.join('\n');
    const outputSha256 = createHash('sha256')
      .update(reportMarkdown, 'utf8')
      .digest('hex');

    return {
      task_kind: SUPPORTED_TASK_KIND,
      files_analyzed: filesAnalyzed,
      summary: `Analyzed ${filesAnalyzed.length} files and generated documentation report.`,
      report_markdown: reportMarkdown,
      output_sha256: outputSha256,
      generated_at: new Date().toISOString(),
    };
  }

  private async runWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`Task exceeded timeout of ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
