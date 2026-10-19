import { ownerTransactionIdempotencyKey } from './owner-transaction-rules';

describe('owner transaction rules', () => {
  it('requires and normalizes a printable idempotency key', () => {
    expect(() => ownerTransactionIdempotencyKey(undefined)).toThrow(
      'Idempotency-Key header is required',
    );
    expect(() => ownerTransactionIdempotencyKey('short')).toThrow(
      '8-128 printable ASCII',
    );
    expect(ownerTransactionIdempotencyKey('  owner-capital-001  ')).toBe(
      'owner-capital-001',
    );
  });
});
