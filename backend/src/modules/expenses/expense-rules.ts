import { Prisma } from '../../generated/prisma/client';
import { invalid } from '../../common/http/api-error';
import { parseBusinessDate } from '../finance/business-date';

export function monthlyBusinessDates(
  startDate: string,
  periods: number,
): Date[] {
  let start: Date;
  try {
    start = parseBusinessDate(startDate);
  } catch {
    throw invalid(
      'EXPENSE_PREPAID_START_DATE_INVALID',
      'Prepaid schedule start_date must be a valid calendar date',
    );
  }
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  return Array.from({ length: periods }, (_, index) => {
    const targetMonth = month + index;
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay)));
  });
}

export function splitScheduleAmount(amount: Prisma.Decimal, periods: number) {
  const portion = amount
    .div(periods)
    .toDecimalPlaces(12, Prisma.Decimal.ROUND_DOWN);
  const final = amount.minus(portion.times(periods - 1));
  return Array.from({ length: periods }, (_, index) =>
    index === periods - 1 ? final : portion,
  );
}

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
