import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const ORDER_TIMEOUT_SCHEDULER = 'order-timeout-scan';

@Injectable()
export class OrderTimeoutScheduler implements OnApplicationBootstrap {
  constructor(
    @InjectQueue('order-maintenance') private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      ORDER_TIMEOUT_SCHEDULER,
      { every: 30_000 },
      {
        name: 'timeout-scan',
        data: {},
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
  }
}
