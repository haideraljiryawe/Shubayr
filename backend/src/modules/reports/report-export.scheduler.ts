import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const REPORT_EXPORT_RECOVERY_SCHEDULER = 'report-export-recovery-scan';

@Injectable()
export class ReportExportScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue('report-exports') private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      REPORT_EXPORT_RECOVERY_SCHEDULER,
      { every: 30_000 },
      {
        name: 'recover-interrupted',
        data: {},
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
  }
}
