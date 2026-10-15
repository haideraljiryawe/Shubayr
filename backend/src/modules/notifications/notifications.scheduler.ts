import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const NOTIFICATION_SCHEDULERS = {
  outbox: 'notification-outbox-scan',
  stream: 'notification-stream-publish',
} as const;

@Injectable()
export class NotificationsScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue('notifications') private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    await Promise.all([
      this.queue.upsertJobScheduler(
        NOTIFICATION_SCHEDULERS.outbox,
        { every: 1_000 },
        {
          name: 'outbox-scan',
          data: {},
          opts: { removeOnComplete: 100, removeOnFail: 100 },
        },
      ),
      this.queue.upsertJobScheduler(
        NOTIFICATION_SCHEDULERS.stream,
        { every: 1_000 },
        {
          name: 'stream-publish',
          data: {},
          opts: { removeOnComplete: 100, removeOnFail: 100 },
        },
      ),
    ]);
  }
}
