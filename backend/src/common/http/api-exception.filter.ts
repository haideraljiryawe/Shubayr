import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError, codeForStatus } from './api-error';

// Exception messages can contain user-supplied values (including an OTP or a
// provider key). Keep the diagnostic and stack frames, but never log those
// values. The HTTP response remains the existing generic 500 response.
function safeDiagnostic(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk_(?:dev_|live_)?[\w-]+\b/gi, '[REDACTED]')
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{16,}\b/g,
      '[REDACTED]',
    )
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[REDACTED]')
    .replace(/\b\d{6}\b/g, '[REDACTED]')
    .replace(/(password|secret|token|key|code)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .slice(0, 4000);
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string | number }>();
    const response = http.getResponse<Response>();
    const route = (request as unknown as { route?: { path?: unknown } }).route
      ?.path;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const source =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    if (status >= 500) {
      const error = exception instanceof Error ? exception : undefined;
      const rawCode = error && 'code' in error ? error.code : undefined;
      const rawMetaCode =
        error &&
        'meta' in error &&
        error.meta &&
        typeof error.meta === 'object' &&
        'code' in error.meta
          ? error.meta.code
          : undefined;
      this.logger.error({
        request_id: request.id ?? null,
        method: request.method,
        route: `${request.baseUrl ?? ''}${typeof route === 'string' ? route : ''}`,
        exception_class: error?.constructor.name ?? typeof exception,
        exception_code:
          typeof rawCode === 'string' && /^(?:P\d{4}|\d{5})$/.test(rawCode)
            ? rawCode
            : null,
        database_code:
          typeof rawMetaCode === 'string' && /^\d{5}$/.test(rawMetaCode)
            ? rawMetaCode
            : null,
        message: safeDiagnostic(error?.message ?? 'Non-Error thrown'),
        stack: error?.stack
          ? safeDiagnostic(error.stack.split('\n').slice(1).join('\n'))
          : null,
      });
    }

    if (typeof source === 'object' && source && 'code' in source) {
      response.status(status).json(source);
      return;
    }

    const message =
      typeof source === 'string'
        ? source
        : typeof source === 'object' && source && 'message' in source
          ? Array.isArray(source.message)
            ? source.message.join('; ')
            : String(source.message)
          : status === 500
            ? 'Internal server error'
            : 'Request failed';

    response.status(status).json({
      status,
      code: codeForStatus(status),
      message,
      errors: [],
    } satisfies ApiError);
  }
}
