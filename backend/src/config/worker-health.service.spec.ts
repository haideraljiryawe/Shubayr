import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { WorkerHealthService } from './worker-health.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

describe('WorkerHealthService', () => {
  const originalRole = process.env.PROCESS_ROLE;

  afterEach(() => {
    if (originalRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = originalRole;
  });

  it('marks a jobs-only process ready and removes the marker on shutdown', async () => {
    process.env.PROCESS_ROLE = 'worker';
    const directory = await mkdtemp(join(tmpdir(), 'shubayr-worker-'));
    const healthFile = join(directory, 'ready');
    const config = {
      get: jest.fn((_key: string, fallback: string) => healthFile || fallback),
    } as unknown as ConfigService;
    const service = new WorkerHealthService(config);

    await service.onModuleInit();
    await service.onApplicationBootstrap();
    expect(JSON.parse(await readFile(healthFile, 'utf8'))).toEqual({
      pid: process.pid,
      ready_at: expect.any(String) as string,
    });

    await service.onApplicationShutdown();
    await expect(readFile(healthFile)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await rm(directory, { recursive: true, force: true });
  });
});
