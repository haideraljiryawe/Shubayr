jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { CurrencyService } from './currency.service';

describe('CurrencyService', () => {
  type RateQuery = {
    where: { currency_code: string; effective_at: { lte: Date } };
  };
  const currency = { findFirst: jest.fn() };
  const rates = [
    {
      id: 'future',
      currency_code: 'USD',
      rate: 1320,
      effective_at: new Date('2026-10-03T12:00:00.000Z'),
      set_by: 'actor',
      reason: 'Scheduled',
      created_at: new Date('2026-10-03T10:00:00.000Z'),
    },
    {
      id: 'same-day',
      currency_code: 'USD',
      rate: 1310,
      effective_at: new Date('2026-10-03T11:00:00.000Z'),
      set_by: 'actor',
      reason: 'Market update',
      created_at: new Date('2026-10-03T11:00:00.000Z'),
    },
    {
      id: 'back-date-close',
      currency_code: 'USD',
      rate: 1305,
      effective_at: new Date('2026-10-02T20:30:00.000Z'),
      set_by: 'actor',
      reason: 'Closing rate',
      created_at: new Date('2026-10-02T20:30:00.000Z'),
    },
    {
      id: 'back-date-open',
      currency_code: 'USD',
      rate: 1300,
      effective_at: new Date('2026-10-02T06:00:00.000Z'),
      set_by: 'actor',
      reason: 'Opening rate',
      created_at: new Date('2026-10-02T06:00:00.000Z'),
    },
  ];
  const findRate = ({ where }: RateQuery) =>
    Promise.resolve(
      rates.find(
        (rate) =>
          rate.currency_code === where.currency_code &&
          rate.effective_at <= where.effective_at.lte,
      ) ?? null,
    );
  const exchangeRate = {
    findFirst: jest.fn(findRate),
  };
  const service = new CurrencyService(
    { currency, exchangeRate } as never,
    {} as never,
    { today: jest.fn().mockResolvedValue('2026-10-03') } as never,
  );
  const at = new Date('2026-10-03T00:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-03T11:05:00.000Z'));
    currency.findFirst.mockReset().mockResolvedValue({
      code: 'IQD',
      is_base: true,
    });
    exchangeRate.findFirst.mockReset().mockImplementation(findRate);
  });

  afterEach(() => jest.useRealTimers());

  it('uses one only for the configured base currency', async () => {
    const rate = await service.requireRate('IQD', at);

    expect(rate.toString()).toBe('1');
    expect(exchangeRate.findFirst).not.toHaveBeenCalled();
  });

  it.each(['USD', 'ZZZ'])(
    'returns the declared missing-rate error for %s',
    async (code) => {
      exchangeRate.findFirst.mockResolvedValue(null);

      await expect(service.requireRate(code, at)).rejects.toMatchObject({
        response: {
          status: 422,
          code: 'EXCHANGE_RATE_NOT_FOUND',
          message: `No exchange rate exists for ${code} at the requested date`,
          errors: [],
        },
      });
    },
  );

  it('uses a rate entered at 14:00 Baghdad for a posting at 14:05', async () => {
    const rate = await service.requireRate(
      'USD',
      new Date('2026-10-03T00:00:00.000Z'),
    );

    expect(rate.toString()).toBe('1310');
    expect(
      exchangeRate.findFirst.mock.calls[0][0].where.effective_at.lte,
    ).toEqual(new Date('2026-10-03T11:05:00.000Z'));
  });

  it("uses a back-dated document day's closing rate", async () => {
    const rate = await service.requireRate(
      'USD',
      new Date('2026-10-02T00:00:00.000Z'),
    );

    expect(rate.toString()).toBe('1305');
    expect(
      exchangeRate.findFirst.mock.calls[0][0].where.effective_at.lte,
    ).toEqual(new Date('2026-10-02T20:59:59.999Z'));
  });

  it('never selects a future-effective rate early', async () => {
    const rate = await service.requireRate(
      'USD',
      new Date('2026-10-03T00:00:00.000Z'),
    );

    expect(rate.toString()).toBe('1310');
    expect(rate.toString()).not.toBe('1320');
  });
});
