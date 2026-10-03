jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { DocumentNumberService } from './document-number.service';

describe('DocumentNumberService', () => {
  it('uses the Baghdad year during the January 1 UTC boundary', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ last_value: 1 }]),
    };

    const number = await new DocumentNumberService().issue(
      tx as never,
      'stock_count',
      'INV-COUNT',
      new Date('2026-12-31T22:00:00.000Z'),
    );

    expect(number).toBe('INV-COUNT-2027-000001');
  });
});
