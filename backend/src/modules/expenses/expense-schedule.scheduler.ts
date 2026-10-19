import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const EXPENSE_SCHEDULE_CATCHUP_SCHEDULER =
  'expense-prepaid-catchup-scan';

@Injectable()
export class ExpenseScheduleScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue('expense-schedules') private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      EXPENSE_SCHEDULE_CATCHUP_SCHEDULER,
      { pattern: '5 0 * * *', tz: 'Asia/Baghdad' },
      {
        name: 'catch-up',
        data: {},
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
    await this.queue.add(
      'catch-up',
      {},
      {
        jobId: 'expense-prepaid-startup-catchup',
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }
}
