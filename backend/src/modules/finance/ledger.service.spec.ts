jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { LedgerService } from './ledger.service';
import { PeriodClosedException } from './period-closed.exception';

const original = {
  id: '10000000-0000-4000-8000-000000000001',
  document_number: 'JRN-2026-000001',
  lines: [
    {
      account: { code: '1000' },
      debit_base: { gt: () => true, toString: () => '100' },
      credit_base: { toString: () => '0' },
      currency_code: 'IQD',
      original_amount: { toString: () => '100' },
      exchange_rate: { toString: () => '1' },
    },
    {
      account: { code: '3000' },
      debit_base: { gt: () => false, toString: () => '0' },
      credit_base: { toString: () => '100' },
      currency_code: 'IQD',
      original_amount: { toString: () => '100' },
      exchange_rate: { toString: () => '1' },
    },
  ],
};

describe('LedgerService reversal business date', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-31T22:30:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  it('posts a reversal in the current Baghdad period, not the original period', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      journalEntry: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(original)
          .mockResolvedValueOnce(null),
      },
    };
    const prisma = {
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    };
    const service = new LedgerService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const post = jest
      .spyOn(service, 'post')
      .mockResolvedValue({ id: 'reversal' } as never);

    await expect(
      service.reverse(original.id, 'actor', 'Correction'),
    ).resolves.toEqual({
      id: 'reversal',
    });
    expect(post).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        documentDate: new Date('2026-11-01T00:00:00.000Z'),
        accountingDate: new Date('2026-11-01T00:00:00.000Z'),
        reversesId: original.id,
      }),
    );
  });

  it('refuses the reversal before creating a journal when November is closed', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      journalEntry: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(original)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: (work: (client: unknown) => unknown) => work(tx),
    };
    const dates = {
      assertOpen: jest
        .fn()
        .mockRejectedValue(
          new PeriodClosedException(new Date('2026-11-01T00:00:00.000Z')),
        ),
    };
    const service = new LedgerService(
      prisma as never,
      {} as never,
      dates as never,
    );

    await expect(
      service.reverse(original.id, 'actor', 'Correction'),
    ).rejects.toMatchObject({
      response: { code: 'PERIOD_CLOSED', period: '2026-11' },
    });
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});
