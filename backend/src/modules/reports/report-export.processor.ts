import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ReportExportService } from './report-export.service';

@Processor('report-exports', { lockDuration: 120_000, maxStalledCount: 2 })
export class ReportExportProcessor extends WorkerHost {
  constructor(private readonly exports: ReportExportService) {
    super();
  }

  async process(job: Job<{ exportId?: string }>) {
    if (job.name === 'recover-interrupted') {
      await this.exports.resumeInterrupted();
      return;
    }
    if (job.name === 'generate' && job.data.exportId) {
      await this.exports.process(job.data.exportId);
    }
  }
}
