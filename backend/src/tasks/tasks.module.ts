import { Module } from '@nestjs/common';
import { TaskRunnerService } from './task-runner.service';
import { TasksController } from './tasks.controller';

@Module({
  controllers: [TasksController],
  providers: [TaskRunnerService],
  exports: [TaskRunnerService],
})
export class TasksModule {}
