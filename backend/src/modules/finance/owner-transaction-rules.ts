import { invalid } from '../../common/http/api-error';

export function ownerTransactionIdempotencyKey(value: string | undefined) {
  const key = value?.trim();
  if (!key) {
    throw invalid(
      'OWNER_TRANSACTION_IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header is required',
    );
  }
  if (key.length < 8 || key.length > 128 || /[^\x20-\x7E]/.test(key)) {
    throw invalid(
      'OWNER_TRANSACTION_IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key must be 8-128 printable ASCII characters',
    );
  }
  return key;
}
