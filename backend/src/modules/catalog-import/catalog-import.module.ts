import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MediaModule } from '../media/media.module';
import {
  CatalogImageImportController,
  CatalogImportController,
} from './catalog-import.controller';
import { CatalogImportProcessor } from './catalog-import.processor';
import { CatalogImportService } from './catalog-import.service';
import { CatalogImportScheduler } from './catalog-import.scheduler';
import { runsBackgroundJobs } from '../../config/process-role';

export const catalogImportWorkerProviders = () =>
  runsBackgroundJobs() ? [CatalogImportProcessor, CatalogImportScheduler] : [];

@Module({
  imports: [
    BullModule.registerQueue({ name: 'catalog-imports' }),
    FinanceModule,
    InventoryModule,
    MediaModule,
  ],
  controllers: [CatalogImportController, CatalogImageImportController],
  providers: [CatalogImportService, ...catalogImportWorkerProviders()],
})
export class CatalogImportModule {}
