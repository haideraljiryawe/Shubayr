import { Prisma } from '../../generated/prisma/client';
import { serializeResponseDecimals } from './decimal-response.interceptor';

describe('Decimal response serialization', () => {
  it('turns every nested Prisma Decimal into a plain JSON number', () => {
    const createdAt = new Date('2026-09-29T00:00:00.000Z');
    const result = serializeResponseDecimals({
      protection_thresholds: {
        price: new Prisma.Decimal('50.25'),
      },
      rows: [{ amount: new Prisma.Decimal('6000') }],
      created_at: createdAt,
    });

    expect(result).toEqual({
      protection_thresholds: { price: 50.25 },
      rows: [{ amount: 6000 }],
      created_at: createdAt,
    });
    expect(JSON.stringify(result)).not.toContain('"d"');
  });
});
