import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';

@Public()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ready'; database: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'up' };
    } catch {
      throw new ServiceUnavailableException('Database is unavailable');
    }
  }
}

@Public()
@Controller('version')
export class VersionController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  version(): { release: string; commit: string } {
    return {
      release: this.config.get<string>('RELEASE_VERSION', 'development'),
      commit: this.config.get<string>('RELEASE_COMMIT', 'unknown'),
    };
  }
}
