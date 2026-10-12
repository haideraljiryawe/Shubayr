jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../catalog/products.service', () => ({ ProductsService: class {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import { Prisma } from '../../generated/prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService monitor list', () => {
  it('returns each order total with its stored currency', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ count: 1n }])
      .mockResolvedValueOnce([{ status: 'pending', count: 1n }])
      .mockResolvedValueOnce([
        {
          id: 'order-1',
          order_number: 'ORD-1',
          status: 'pending',
          customer_name: 'Customer',
          customer_phone: '+9647700000000',
          total: new Prisma.Decimal('12.50'),
          payment_method: 'cod',
          currency_code: 'USD',
          placed_at: new Date('2026-10-12T08:00:00.000Z'),
        },
      ]);
    const prisma = {
      $queryRaw: queryRaw,
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.listMonitor({ page: 1, per_page: 20 });

    expect(result.data).toEqual([
      expect.objectContaining({ total: 12.5, currency: 'USD' }),
    ]);
    expect(result.data[0]).not.toHaveProperty('currency_code');
  });
});
