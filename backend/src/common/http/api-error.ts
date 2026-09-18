import {
  HttpStatus,
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
};

export function codeForStatus(status: number): string {
  return statusCodes[status] ?? 'INTERNAL_ERROR';
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
