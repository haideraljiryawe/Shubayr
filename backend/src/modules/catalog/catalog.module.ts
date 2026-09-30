import { Module } from '@nestjs/common';
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

@Module({
  imports: [MediaModule],
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
    {
      provide: APP_INTERCEPTOR,
      useClass: BilingualNameFallbackInterceptor,
    },
  ],
  exports: [ProductsService],
})
export class CatalogModule {}
