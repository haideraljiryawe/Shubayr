import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { runsBackgroundJobs } from '../../config/process-role';
import { MediaModule } from '../media/media.module';
import { ReportExportProcessor } from './report-export.processor';
import { ReportExportScheduler } from './report-export.scheduler';
import { ReportExportService } from './report-export.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

export const reportWorkerProviders = () =>
  runsBackgroundJobs() ? [ReportExportProcessor, ReportExportScheduler] : [];

@Module({
  imports: [BullModule.registerQueue({ name: 'report-exports' }), MediaModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportExportService, ...reportWorkerProviders()],
})
export class ReportsModule {}
