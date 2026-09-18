import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MediaModule } from '../media/media.module';
import {
  AdminCategoriesController,
  AdminProductsController,
} from './admin-catalog.controller';
import { BilingualNameFallbackInterceptor } from './bilingual-name-fallback.interceptor';
import { CatalogController } from './catalog.controller';
import { CategoriesService } from './categories.service';
import { ProductsService } from './products.service';

@Module({
  imports: [MediaModule],
  controllers: [
    CatalogController,
    AdminCategoriesController,
    AdminProductsController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: BilingualNameFallbackInterceptor,
    },
  ],
})
export class CatalogModule {}
