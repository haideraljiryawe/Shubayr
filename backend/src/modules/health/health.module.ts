import { Module } from '@nestjs/common';
import { HealthController, VersionController } from './health.controller';

@Module({ controllers: [HealthController, VersionController] })
export class HealthModule {}
