import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { TaskRunnerService, type SubmitTaskInput } from './task-runner.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly taskRunner: TaskRunnerService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submitTask(@Body() body: SubmitTaskInput) {
    return this.taskRunner.submitAndRunTask(body);
  }

  @Get(':taskId')
  async getTask(@Param('taskId') taskId: string) {
    return this.taskRunner.getTask(taskId);
  }

  @Post(':taskId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelTask(@Param('taskId') taskId: string) {
    return this.taskRunner.cancelTask(taskId);
  }
}
