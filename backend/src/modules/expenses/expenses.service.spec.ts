import { Prisma } from '../../generated/prisma/client';
import {
  expenseIdempotencyKey,
  expensePostingLines,
  monthlyBusinessDates,
  splitScheduleAmount,
} from './expense-rules';

describe('ExpensesService accounting rules', () => {
  it('requires an Idempotency-Key', () => {
    expect(() => expenseIdempotencyKey(undefined)).toThrow(
      'Idempotency-Key header is required',
    );
  });

  it('rejects short and non-ASCII idempotency keys', () => {
    expect(() => expenseIdempotencyKey('short')).toThrow(
      '8-128 printable ASCII',
    );
    expect(() => expenseIdempotencyKey('expense-مفتاح')).toThrow(
      '8-128 printable ASCII',
    );
  });

  it('normalizes an otherwise valid idempotency key', () => {
    expect(expenseIdempotencyKey('  expense-123  ')).toBe('expense-123');
  });

  it('builds a balanced original-currency posting', () => {
    const lines = expensePostingLines(
      '5100',
      '2040',
      new Prisma.Decimal('25.50'),
      new Prisma.Decimal('33405'),
      'USD',
      new Prisma.Decimal('1310'),
    );
    expect(lines).toEqual([
      {
        accountCode: '5100',
        side: 'debit',
        baseAmount: '33405',
        currencyCode: 'USD',
        originalAmount: '25.5',
        exchangeRate: '1310',
      },
      {
        accountCode: '2040',
        side: 'credit',
        baseAmount: '33405',
        currencyCode: 'USD',
        originalAmount: '25.5',
        exchangeRate: '1310',
      },
    ]);
  });

  it('clamps monthly prepaid dates and allocates the exact final remainder', () => {
    expect(
      monthlyBusinessDates('2026-01-31', 3).map((date) =>
        date.toISOString().slice(0, 10),
      ),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    const shares = splitScheduleAmount(new Prisma.Decimal('100'), 3);
    expect(shares.map((share) => share.toFixed(12))).toEqual([
      '33.333333333333',
      '33.333333333333',
      '33.333333333334',
    ]);
    expect(
      shares
        .reduce((sum, share) => sum.plus(share), new Prisma.Decimal(0))
        .toString(),
    ).toBe('100');
  });
});
