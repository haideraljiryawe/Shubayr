import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationDeliveryError } from './notification-provider';
import { NotificationStreamService } from './notification-stream.service';

@Processor('notifications', {
  maxStalledCount: 2,
  settings: {
    backoffStrategy: (attemptsMade, type, error) => {
      if (type !== 'push') return -1;
      const retryAfter =
        error instanceof NotificationDeliveryError
          ? (error.retryAfterMs ?? 0)
          : 0;
      return Math.max(retryAfter, Math.min(60_000, 1000 * 2 ** attemptsMade));
    },
  },
})
export class NotificationsProcessor extends WorkerHost {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly stream: NotificationStreamService,
  ) {
    super();
  }

  async process(job: Job<{ eventId?: string }>) {
    if (job.name === 'fanout' && job.data.eventId) {
      await this.notifications.dispatch(job.data.eventId);
      return;
    }
    if (job.name === 'outbox-scan') {
      await this.notifications.enqueuePending();
      return;
    }
    if (job.name === 'stream-publish') await this.stream.publishPending();
  }
}
