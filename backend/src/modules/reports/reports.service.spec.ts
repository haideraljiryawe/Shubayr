jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../audit/audit.service', () => ({ AuditService: class {} }));

import { ForbiddenException } from '@nestjs/common';
import { ReportsService } from './reports.service';

const actor = {
  id: '11111111-1111-4111-8111-111111111111',
  permissions: [
    'reports.sales.read',
    'reports.profit.read',
    'reports.financial.read',
  ],
};

describe('ReportsService', () => {
  it('returns exact sales totals and keeps cost fields out of sales rows', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          group_key: '2026-10-18',
          name_ar: '2026-10-18',
          name_en: '2026-10-18',
          gross_sales: '100000',
          tier_discounts: '10000',
          coupon_discounts: '0',
          other_discounts: '5000',
          returns: '20000',
          net_sales: '65000',
          order_count: 2n,
          total_groups: 1n,
        },
      ])
      .mockResolvedValueOnce([
        {
          gross_sales: '100000',
          tier_discounts: '10000',
          coupon_discounts: '0',
          other_discounts: '5000',
          returns: '20000',
          net_sales: '65000',
          order_count: 2n,
          total_groups: 0n,
          original_delivery_fees: '5000',
          charged_delivery_fees: '7000',
          delivery_fee_adjustments: '2000',
          delivery_fee_refunds: '1000',
        },
      ])
      .mockResolvedValueOnce([{ cancelled_count: 3n, rejected_count: 1n }])
      .mockResolvedValueOnce([{ touches: true }]);
    const audit = { record: jest.fn() };
    const service = new ReportsService({ $queryRaw: queryRaw } as never, audit);

    const result = await service.sales(actor, {
      from: '2026-10-01',
      to: '2026-10-31',
      group_by: 'day',
    });

    expect(result.totals).toEqual(
      expect.objectContaining({
        net_sales: '65000.0000',
        charged_delivery_fees: '7000.0000',
        delivery_fee_adjustments: '2000.0000',
        average_order_value: '35500.0000',
        cancelled_count: 3,
      }),
    );
    expect(result.data[0]).not.toHaveProperty('cost_of_goods_sold');
    expect(result.orders_count).toBe(2);
  });

  it('refuses profitability without the dedicated cost permission', async () => {
    const service = new ReportsService({} as never, {} as never);
    await expect(
      service.profitability(
        { id: actor.id, permissions: ['reports.sales.read'] },
        { from: '2026-10-01', to: '2026-10-31' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('computes margin after exact return cost reversals and audits the read', async () => {
    const row = {
      group_key: 'product-1',
      name_ar: 'منتج',
      name_en: 'Product',
      gross_sales: '100',
      tier_discounts: '10',
      coupon_discounts: '0',
      other_discounts: '0',
      returns: '20',
      net_sales: '70',
      cost_of_goods_sold: '40',
      return_cost_reversals: '8',
      inventory_write_downs: '3',
      order_count: 1n,
      total_groups: 1n,
    };
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ touches: false }]);
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ReportsService({ $queryRaw: queryRaw } as never, audit);

    const result = await service.profitability(actor, {
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(result.totals.gross_profit).toBe('38.0000');
    expect(result.totals.margin_percent).toBe('54.2857');
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'report.read' }),
    );
  });

  it('marks a trial balance as balanced from database totals', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '22222222-2222-4222-8222-222222222222',
          code: '1000',
          name_ar: 'مخزون',
          name_en: 'Inventory',
          type: 'asset',
          normal_side: 'debit',
          debit: '100',
          credit: '0',
          balance: '100',
          debit_total: '100',
          credit_total: '100',
          total_accounts: 1n,
        },
      ])
      .mockResolvedValueOnce([
        { debit: '100', credit: '100', total_accounts: 1n },
      ])
      .mockResolvedValueOnce([{ touches: false }]);
    const service = new ReportsService(
      { $queryRaw: queryRaw } as never,
      {} as never,
    );

    const result = await service.trialBalance(actor, {
      as_of: '2026-10-31',
    });

    expect(result.balanced).toBe(true);
    expect(result.debit_total).toBe('100.0000');
    expect(result.pagination.total).toBe(1);
  });
});
