jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRetrievalDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

describe('retrieval input contract', () => {
  it.each(['cancel', 'retry'] as const)(
    'accepts the %s outcome',
    async (outcome) => {
      const input = plainToInstance(CreateRetrievalDto, {
        operation_id: 'retrieval-operation-1',
        outcome,
        reason: 'Return goods from custody',
      });

      await expect(validate(input)).resolves.toEqual([]);
    },
  );
});

describe('InventoryService retrieval listing', () => {
  it('filters all retrievals by party, order, status and business date', async () => {
    const row = {
      id: 'retrieval-1',
      document_number: 'RET-1',
      order_id: '11111111-1111-4111-8111-111111111111',
      delivery_id: '22222222-2222-4222-8222-222222222222',
      custody_party_id: '33333333-3333-4333-8333-333333333333',
      status: 'open',
      outcome: 'retry',
      reason: 'Retry delivery',
      document_date: new Date('2026-10-01T00:00:00.000Z'),
      created_at: new Date('2026-10-01T09:00:00.000Z'),
      closed_at: null,
      order: {
        id: '11111111-1111-4111-8111-111111111111',
        order_number: 'ORD-1',
      },
      custody_party: {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Agent',
        phone: '+9647700000000',
      },
      _count: { lines: 2 },
    };
    const findMany = jest.fn().mockResolvedValue([row]);
    const prisma = {
      retrieval: { count: jest.fn().mockResolvedValue(1), findMany },
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const service = new InventoryService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listRetrievals({
      party_id: row.custody_party_id,
      order_id: row.order_id,
      status: 'open',
      from: '2026-10-01',
      to: '2026-10-02',
      page: 2,
      per_page: 10,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          custody_party_id: row.custody_party_id,
          order_id: row.order_id,
          status: 'open',
          document_date: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-02T00:00:00.000Z'),
          },
        },
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toMatchObject({
      page: 2,
      per_page: 10,
      total: 1,
      data: [
        {
          id: 'retrieval-1',
          document_date: '2026-10-01',
          line_count: 2,
          order: { order_number: 'ORD-1' },
          custody_party: { name: 'Agent' },
        },
      ],
    });
  });

  it('rejects an inverted retrieval date range', async () => {
    const service = new InventoryService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.listRetrievals({ from: '2026-10-02', to: '2026-10-01' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
