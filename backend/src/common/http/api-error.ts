import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
  ValidationError,
} from '@nestjs/common';

export type ApiFieldError = {
  field: string;
  code: string;
  message: string;
};

export type ApiError = {
  status: number;
  code: string;
  message: string;
  errors: ApiFieldError[];
};

const statusCodes: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
};

export function codeForStatus(status: number): string {
  return statusCodes[status] ?? 'INTERNAL_ERROR';
}

export function codedError(
  status: number,
  code: string,
  message: string,
  errors: ApiFieldError[] = [],
): ApiError {
  return { status, code, message, errors };
}

export function conflict(code: string, message: string): ConflictException {
  return new ConflictException(codedError(HttpStatus.CONFLICT, code, message));
}

export function forbidden(code: string, message: string): ForbiddenException {
  return new ForbiddenException(
    codedError(HttpStatus.FORBIDDEN, code, message),
  );
}

export function invalid(
  code: string,
  message: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException(
    codedError(HttpStatus.UNPROCESSABLE_ENTITY, code, message),
  );
}

export function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException(
    codedError(HttpStatus.BAD_REQUEST, code, message),
  );
}

export function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException(codedError(HttpStatus.NOT_FOUND, code, message));
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ApiFieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(
      ([code, message]) => ({ field, code, message }),
    );
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'VALIDATION_FAILED',
    message: 'Request validation failed',
    errors: flattenValidationErrors(errors),
  } satisfies ApiError);
}
