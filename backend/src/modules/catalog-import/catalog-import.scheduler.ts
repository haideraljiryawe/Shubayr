import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const CATALOG_IMPORT_RECOVERY_SCHEDULER = 'catalog-import-recovery-scan';

@Injectable()
export class CatalogImportScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue('catalog-imports') private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      CATALOG_IMPORT_RECOVERY_SCHEDULER,
      { every: 30_000 },
      {
        name: 'recover-interrupted',
        data: {},
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      },
    );
  }
}
