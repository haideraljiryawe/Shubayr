import assert from 'node:assert/strict';
import { test } from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { strictResponseSchema } from './openapi-response-validator.mjs';

test('strict response schemas reject wrong types and undeclared fields', () => {
  const schema = strictResponseSchema({
    type: 'object',
    required: ['amount'],
    properties: { amount: { type: 'number' } },
  });
  const validate = new Ajv2020().compile(schema);
  assert.equal(validate({ amount: 50 }), true);
  assert.equal(validate({ amount: { s: 1, e: 1, d: [50] } }), false);
  assert.equal(validate({ amount: 50, closes: [] }), false);
});

test('explicit dynamic maps stay open and composed object fields are merged', () => {
  const schema = strictResponseSchema({
    allOf: [
      {
        type: 'object',
        required: ['page'],
        properties: { page: { type: 'integer' } },
      },
      {
        type: 'object',
        required: ['settings'],
        properties: {
          settings: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
    ],
  });
  const validate = new Ajv2020().compile(schema);
  assert.equal(
    validate({ page: 1, settings: { timezone: 'Asia/Baghdad' } }),
    true,
  );
  assert.equal(validate({ page: 1, settings: {}, extra: true }), false);
});
