import {
  paidNowDocumentOperationId,
  purchaseIdempotencyKey,
} from './purchasing-rules';

describe('purchasing rules', () => {
  it('requires a printable, reusable Idempotency-Key', () => {
    expect(() => purchaseIdempotencyKey(undefined)).toThrow(
      'Idempotency-Key header is required',
    );
    expect(() => purchaseIdempotencyKey('short')).toThrow(
      'Idempotency-Key must be 8-128 printable ASCII characters',
    );
    expect(() => purchaseIdempotencyKey('purchase-مفتاح')).toThrow(
      'Idempotency-Key must be 8-128 printable ASCII characters',
    );
    expect(purchaseIdempotencyKey('  purchase-paid-now-001  ')).toBe(
      'purchase-paid-now-001',
    );
  });

  it('derives stable, distinct document operation ids', () => {
    const invoice = paidNowDocumentOperationId(
      'purchase-paid-now-001',
      'invoice',
    );
    const payment = paidNowDocumentOperationId(
      'purchase-paid-now-001',
      'payment',
    );
    expect(invoice).not.toBe(payment);
    expect(invoice).toHaveLength(81);
    expect(invoice).toBe(
      paidNowDocumentOperationId('purchase-paid-now-001', 'invoice'),
    );
  });
});
