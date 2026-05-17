import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NOTIFICATIONS } from './queues.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}