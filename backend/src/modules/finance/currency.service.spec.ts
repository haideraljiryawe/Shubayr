jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { CurrencyService } from './currency.service';

describe('CurrencyService', () => {
  const currency = { findFirst: jest.fn() };
  const exchangeRate = { findFirst: jest.fn() };
  const service = new CurrencyService(
    { currency, exchangeRate } as never,
    {} as never,
    { today: jest.fn().mockResolvedValue('2026-10-03') } as never,
  );
  const at = new Date('2026-10-03T00:00:00.000Z');

  beforeEach(() => {
    currency.findFirst.mockReset().mockResolvedValue({
      code: 'IQD',
      is_base: true,
    });
    exchangeRate.findFirst.mockReset();
  });

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
});
