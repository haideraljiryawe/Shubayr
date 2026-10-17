import { Prisma } from '../../generated/prisma/client';
import { invalid } from '../../common/http/api-error';

export function expenseIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) {
    throw invalid(
      'EXPENSE_IDEMPOTENCY_KEY_REQUIRED',
      'Idempotency-Key header is required',
    );
  }
  if (key.length < 8 || key.length > 128 || /[^\x20-\x7E]/.test(key)) {
    throw invalid(
      'EXPENSE_IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key must be 8-128 printable ASCII characters',
    );
  }
  return key;
}

export function expensePostingLines(
  debitCode: string,
  creditCode: string,
  original: Prisma.Decimal,
  base: Prisma.Decimal,
  currency: string,
  rate: Prisma.Decimal,
) {
  return [
    {
      accountCode: debitCode,
      side: 'debit' as const,
      baseAmount: base.toString(),
      currencyCode: currency,
      originalAmount: original.toString(),
      exchangeRate: rate.toString(),
    },
    {
      accountCode: creditCode,
      side: 'credit' as const,
      baseAmount: base.toString(),
      currencyCode: currency,
      originalAmount: original.toString(),
      exchangeRate: rate.toString(),
    },
  ];
}
