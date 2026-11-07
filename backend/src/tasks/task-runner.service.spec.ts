import { BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TaskRunnerService } from './task-runner.service';

describe('TaskRunnerService', () => {
  let db: DatabaseService;
  let service: TaskRunnerService;

  beforeEach(() => {
    db = new DatabaseService();
    service = new TaskRunnerService(db);
  });

  it('runs docs_report_v1 against fixtures/sample-repo and produces deterministic output_sha256', async () => {
    const task = await service.submitAndRunTask({
      token_id: '1',
      task_kind: 'docs_report_v1',
      fixture_subpath: 'sample-repo',
    });

    expect(task.status).toBe('completed');
    expect(task.output).not.toBeNull();
    expect(task.output?.output_sha256).toBe(
      '997a048a0f03ea1ecce7df320609b980ac1e7c0db0c97aad31dade52791b4fac',
    );
    expect(task.output?.files_analyzed).toEqual(['README.md', 'calculator.ts']);
  });

  it('rejects unsupported task kinds and remote/traversal paths', async () => {
    await expect(
      service.submitAndRunTask({
        token_id: '1',
        task_kind: 'arbitrary_shell_exec',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.submitAndRunTask({
        token_id: '1',
        task_kind: 'docs_report_v1',
        fixture_subpath: 'https://github.com/example/repo',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.submitAndRunTask({
        token_id: '1',
        task_kind: 'docs_report_v1',
        fixture_subpath: '../contracts',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('enforces bounded concurrency per token', async () => {
    const pending = db.createTask({
      task_id: 'task_running_1',
      token_id: '1',
      task_kind: 'docs_report_v1',
      input: {},
    });
    db.claimPendingTask(pending.task_id);

    await expect(
      service.submitAndRunTask({
        token_id: '1',
        task_kind: 'docs_report_v1',
      }),
    ).rejects.toThrow(ConflictException);
  });
});

