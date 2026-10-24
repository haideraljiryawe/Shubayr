jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import { HealthController, VersionController } from './health.controller';

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

describe('VersionController', () => {
  it('returns release metadata from the image build source', () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'RELEASE_VERSION' ? 'v1.0.0-rc3' : 'abc123',
      ),
    };
    expect(new VersionController(config as never).version()).toEqual({
      release: 'v1.0.0-rc3',
      commit: 'abc123',
    });
  });
});
