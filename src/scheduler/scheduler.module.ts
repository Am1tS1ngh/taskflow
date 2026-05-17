import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../tasks/task.entity';
import { QueuesModule } from '../queues/queues.module';
import { TaskSchedulerService } from './task-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    QueuesModule,
  ],
  providers: [TaskSchedulerService],
})
export class SchedulerModule {}