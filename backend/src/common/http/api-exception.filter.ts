import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiError, codeForStatus } from './api-error';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const source =
      exception instanceof HttpException ? exception.getResponse() : undefined;

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
