import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { Observable, map } from 'rxjs';

/**
 * Prisma Decimal values are class instances. Class-transformer treats them as
 * ordinary objects and exposes decimal.js internals (`s`, `e`, and `d`). The
 * public API contract uses JSON numbers for database Decimal columns, so do
 * that conversion once at the response boundary instead of in every service.
 */
export function serializeResponseDecimals(value: unknown): unknown {
  if (Prisma.Decimal.isDecimal(value)) return Number(value.toString());
  if (Array.isArray(value)) return value.map(serializeResponseDecimals);
  if (
    !value ||
    typeof value !== 'object' ||
    value instanceof Date ||
    Buffer.isBuffer(value)
  ) {
    return value;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      serializeResponseDecimals(item),
    ]),
  );
}

@Injectable()
export class DecimalResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map(serializeResponseDecimals));
  }
}
