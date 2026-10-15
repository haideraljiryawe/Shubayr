import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { OrderTimeoutService } from './order-timeout.service';

@Processor('order-maintenance', { maxStalledCount: 2 })
export class OrderTimeoutProcessor extends WorkerHost {
  constructor(private readonly timeouts: OrderTimeoutService) {
    super();
  }

  async process(job: Job) {
    if (job.name === 'timeout-scan') await this.timeouts.run();
  }
}
