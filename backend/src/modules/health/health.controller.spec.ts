jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  };
  const controller = new HealthController(prisma as never);

  it('reports liveness', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('reports database readiness', async () => {
    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      database: 'up',
    });
  });
});
