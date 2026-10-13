import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { CatalogImportService } from './catalog-import.service';

@Processor('catalog-imports')
export class CatalogImportProcessor extends WorkerHost {
  constructor(private readonly imports: CatalogImportService) {
    super();
  }

  async process(job: Job<{ importId: string }>) {
    if (job.name !== 'validate') return;
    await this.imports.validate(job.data.importId);
  }
}
