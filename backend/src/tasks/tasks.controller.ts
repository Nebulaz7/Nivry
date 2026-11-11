import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from '../session/session-auth.guard';
import { SessionService } from '../session/session.service';
import { TaskRunnerService, type SubmitTaskInput } from './task-runner.service';

@Controller('tasks')
export class TasksController {
  constructor(
    private readonly taskRunner: TaskRunnerService,
    private readonly sessionService: SessionService,
  ) {}

  @Post()
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async submitTask(
    @Body() body: SubmitTaskInput,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.sessionService.assertAgentOwnerOrExecutor(
      body?.token_id,
      req.session!,
      { allowExecutor: true },
    );
    return this.taskRunner.submitAndRunTask(body);
  }

  @Get(':taskId')
  async getTask(@Param('taskId') taskId: string) {
    return this.taskRunner.getTask(taskId);
  }

  @Post(':taskId/cancel')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  async cancelTask(
    @Param('taskId') taskId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const task = await this.taskRunner.getTask(taskId);
    await this.sessionService.assertAgentOwnerOrExecutor(
      task.token_id,
      req.session!,
      { allowExecutor: true },
    );
    return this.taskRunner.cancelTask(taskId);
  }
}
