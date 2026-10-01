jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import {
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DateRulesService } from './date-rules.service';

describe('DateRulesService', () => {
  const accountingPeriod = { findUnique: jest.fn() };
  const storeSetting = { findUnique: jest.fn() };
  const service = new DateRulesService({
    accountingPeriod,
    storeSetting,
  } as never);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-31T22:30:00.000Z'));
    accountingPeriod.findUnique.mockReset().mockResolvedValue(null);
    storeSetting.findUnique
      .mockReset()
      .mockImplementation((input: { where: { key: string } }) =>
        Promise.resolve(
          input.where.key === 'backdating_window_days' ? { value: '90' } : null,
        ),
      );
  });

  afterEach(() => jest.useRealTimers());

  it('uses November 1 in Baghdad for both future-date edges', async () => {
    await expect(
      service.validate({
        documentDate: '2026-11-01',
        accountingDate: '2026-11-01',
        permissions: [],
      }),
    ).resolves.toMatchObject({
      documentDate: new Date('2026-11-01T00:00:00.000Z'),
      accountingDate: new Date('2026-11-01T00:00:00.000Z'),
    });
    await expect(
      service.validate({
        documentDate: '2026-11-02',
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('applies the 90-day window against the Baghdad date at both edges', async () => {
    await expect(
      service.validate({ documentDate: '2026-08-03', permissions: [] }),
    ).resolves.toBeDefined();
    await expect(
      service.validate({ documentDate: '2026-08-02', permissions: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a declared PERIOD_CLOSED error with the period', async () => {
    accountingPeriod.findUnique.mockResolvedValue({ status: 'closed' });
    await expect(
      service.validate({ documentDate: '2026-11-01', permissions: [] }),
    ).rejects.toMatchObject({
      response: {
        status: 409,
        code: 'PERIOD_CLOSED',
        message: 'Accounting period 2026-11 is closed',
        errors: [],
        period: '2026-11',
      },
    });
  });
});
