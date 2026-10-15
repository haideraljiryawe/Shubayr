import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { CatalogSearchService } from './catalog-search.service';

@Processor('catalog-search', { maxStalledCount: 2 })
export class CatalogSearchProcessor extends WorkerHost {
  constructor(private readonly search: CatalogSearchService) {
    super();
  }

  async process(job: Job<{ productId?: string }>) {
    if (job.name === 'index-product' && job.data.productId) {
      await this.search.syncProduct(job.data.productId);
      return;
    }
    if (job.name === 'catch-up') await this.search.connectAndCatchUp();
  }
}
