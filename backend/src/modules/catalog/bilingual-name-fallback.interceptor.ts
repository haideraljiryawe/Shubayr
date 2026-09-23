import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { applyBilingualNameFallback } from './bilingual-name';

@Injectable()
export class BilingualNameFallbackInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(
        map((value: unknown): unknown => applyBilingualNameFallback(value)),
      );
  }
}
