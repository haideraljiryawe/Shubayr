import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MediaModule } from '../media/media.module';
import {
  AdminCategoriesController,
  AdminBrandsController,
  AdminProductsController,
} from './admin-catalog.controller';
import { BilingualNameFallbackInterceptor } from './bilingual-name-fallback.interceptor';
import { CatalogController } from './catalog.controller';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';
import { BrandsService } from './brands.service';
import { CatalogSearchService } from './catalog-search.service';
import { BelowCostService } from './below-cost.service';
import { OperationService } from '../finance/operation.service';
import { CatalogSearchProcessor } from './catalog-search.processor';
import { CatalogSearchScheduler } from './catalog-search.scheduler';
import { runsBackgroundJobs } from '../../config/process-role';

export const catalogSearchWorkerProviders = () =>
  runsBackgroundJobs() ? [CatalogSearchProcessor, CatalogSearchScheduler] : [];

@Module({
  imports: [MediaModule, BullModule.registerQueue({ name: 'catalog-search' })],
  controllers: [
    CatalogController,
    AdminCategoriesController,
    AdminBrandsController,
    AdminProductsController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    BrandsService,
    CatalogSearchService,
    ...catalogSearchWorkerProviders(),
    BelowCostService,
    OperationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: BilingualNameFallbackInterceptor,
    },
  ],
  exports: [ProductsService, BelowCostService],
})
export class CatalogModule {}
