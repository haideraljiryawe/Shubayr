import { createHash } from 'node:crypto';
import { invalid } from '../../common/http/api-error';

export function purchaseIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) {
    throw invalid(
      'PURCHASE_IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header is required',
    );
  }
  if (key.length < 8 || key.length > 128 || /[^\x20-\x7E]/.test(key)) {
    throw invalid(
      'PURCHASE_IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key must be 8-128 printable ASCII characters',
    );
  }
  return key;
}

export function paidNowDocumentOperationId(
  key: string,
  document: 'invoice' | 'payment',
): string {
  const digest = createHash('sha256').update(key).digest('hex');
  return `paid-now:${document}:${digest}`;
}
