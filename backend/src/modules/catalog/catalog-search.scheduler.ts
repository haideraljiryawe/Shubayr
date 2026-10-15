import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const CATALOG_SEARCH_SCHEDULER = 'catalog-search-catch-up';

@Injectable()
export class CatalogSearchScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue('catalog-search') private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      CATALOG_SEARCH_SCHEDULER,
      { every: 30_000 },
      {
        name: 'catch-up',
        data: {},
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
  }
}
