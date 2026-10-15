import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { processRole } from './process-role';

@Injectable()
export class WorkerHealthService
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerHealthService.name);
  private readonly path: string;

  constructor(config: ConfigService) {
    this.path = config.get<string>(
      'WORKER_HEALTH_FILE',
      '/tmp/shubayr-worker-ready',
    );
  }

  async onModuleInit() {
    if (processRole() === 'worker') await rm(this.path, { force: true });
  }

  async onApplicationBootstrap() {
    if (processRole() !== 'worker') return;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      JSON.stringify({ pid: process.pid, ready_at: new Date().toISOString() }),
      { encoding: 'utf8', mode: 0o600 },
    );
    this.logger.log(`Worker ready; health file written to ${this.path}`);
  }

  async onApplicationShutdown() {
    if (processRole() !== 'worker') return;
    await rm(this.path, { force: true });
  }
}
