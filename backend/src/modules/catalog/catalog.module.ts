import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BilingualNameFallbackInterceptor } from './bilingual-name-fallback.interceptor';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: BilingualNameFallbackInterceptor,
    },
  ],
})
export class CatalogModule {}
