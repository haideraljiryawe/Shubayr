import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationDeliveryError } from './notification-provider';

@Processor('notifications', {
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
  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async process(job: Job<{ eventId: string }>) {
    if (job.name !== 'fanout') return;
    await this.notifications.dispatch(job.data.eventId);
  }
}
