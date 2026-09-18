import { ValidationError } from '@nestjs/common';
import {
  codeForStatus,
  flattenValidationErrors,
  validationExceptionFactory,
} from './api-error';

describe('API error contract', () => {
  it('flattens nested field errors with stable validator codes', () => {
    const errors = [
      {
        property: 'items',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'quantity',
                constraints: { min: 'quantity must not be less than 1' },
              },
            ],
          },
        ],
      },
    ] as ValidationError[];

    expect(flattenValidationErrors(errors)).toEqual([
      {
        field: 'items.0.quantity',
        code: 'min',
        message: 'quantity must not be less than 1',
      },
    ]);
  });

  it('uses 422 and VALIDATION_FAILED for DTO validation', () => {
    const exception = validationExceptionFactory([
      {
        property: 'price',
        constraints: { isNumber: 'price must be a number' },
      },
    ]);

    expect(exception.getStatus()).toBe(422);
    expect(exception.getResponse()).toEqual({
      status: 422,
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      errors: [
        {
          field: 'price',
          code: 'isNumber',
          message: 'price must be a number',
        },
      ],
    });
  });

  it('maps ordinary HTTP statuses to stable codes', () => {
    expect(codeForStatus(400)).toBe('BAD_REQUEST');
    expect(codeForStatus(404)).toBe('NOT_FOUND');
    expect(codeForStatus(500)).toBe('INTERNAL_ERROR');
  });
});
