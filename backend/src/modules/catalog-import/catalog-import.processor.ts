import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { CatalogImportService } from './catalog-import.service';

@Processor('catalog-imports', { lockDuration: 120_000, maxStalledCount: 2 })
export class CatalogImportProcessor extends WorkerHost {
  constructor(private readonly imports: CatalogImportService) {
    super();
  }

  async process(job: Job<{ importId: string; commitAttempt?: number }>) {
    if (job.name === 'recover-interrupted') {
      await this.imports.resumeInterrupted();
      return;
    }
    if (job.name === 'validate') {
      await this.imports.validate(job.data.importId);
      return;
    }
    if (job.name === 'commit' && job.data.commitAttempt !== undefined)
      await this.imports.processCommit(
        job.data.importId,
        job.data.commitAttempt,
      );
  }
}
