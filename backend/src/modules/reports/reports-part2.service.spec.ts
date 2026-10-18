jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../audit/audit.service', () => ({ AuditService: class {} }));

import { ReportsPart2Service } from './reports-part2.service';

describe('ReportsPart2Service', () => {
  it('keeps every cash source exact and reconciles its closing balance', () => {
    const service = new ReportsPart2Service({} as never, {} as never);
    const row = service['cashRow']({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Till',
      kind: 'cash',
      currency_code: 'IQD',
      opening: '100.0000',
      inflows: '40.0000',
      outflows: '15.0000',
      customer_receipts_in: '40',
      customer_receipts_out: '0',
      supplier_payments_in: '0',
      supplier_payments_out: '5',
      expense_payments_in: '0',
      expense_payments_out: '2',
      refunds_in: '0',
      refunds_out: '3',
      transfers_in: '0',
      transfers_out: '4',
      corrections_in: '0',
      corrections_out: '1',
      other_in: '0',
      other_out: '0',
    });
    expect(row.closing_balance).toBe('125.0000');
    expect(row.sources.customer_receipts.inflows).toBe('40.0000');
    expect(row.sources.corrections.outflows).toBe('1.0000');
  });

  it('uses stable ageing buckets', () => {
    const service = new ReportsPart2Service({} as never, {} as never);
    expect(service['ageingBucket'](null)).toBe('no_due_date');
    expect(service['ageingBucket'](0)).toBe('current');
    expect(service['ageingBucket'](30)).toBe('1_30');
    expect(service['ageingBucket'](60)).toBe('31_60');
    expect(service['ageingBucket'](90)).toBe('61_90');
    expect(service['ageingBucket'](91)).toBe('90_plus');
  });

  it('omits dashboard profit without reports.profit.read', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          today_sales: '10',
          month_sales: '20',
          today_orders: 1n,
          month_orders: 2n,
        },
      ])
      .mockResolvedValueOnce([{ status: 'pending', count: 1n }])
      .mockResolvedValueOnce([{ waiting: 1n, late: 0n }])
      .mockResolvedValueOnce([{ low: 2n }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ amount: '0' }])
      .mockResolvedValueOnce([{ gross_profit: '8' }]);
    const service = new ReportsPart2Service({ $queryRaw: query } as never, {
      record: jest.fn(),
    });
    const result = await service.dashboard({
      id: '11111111-1111-4111-8111-111111111111',
      permissions: ['orders.view'],
    });
    expect(result.sales).toEqual(
      expect.objectContaining({ month_to_date_net_sales: '20.0000' }),
    );
    expect(result.sales).not.toHaveProperty('month_to_date_gross_profit');
    expect(result).not.toHaveProperty('cash_on_hand');
  });
});
