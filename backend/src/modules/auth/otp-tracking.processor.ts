import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  SmsGatewayService,
  type OtpiqTrackingJob,
} from './sms-gateway.service';
import { runsBackgroundJobs } from '../../config/process-role';

export const otpTrackingWorkerProviders = () =>
  runsBackgroundJobs() ? [OtpTrackingProcessor] : [];

@Processor('otp-tracking', { lockDuration: 150_000, maxStalledCount: 2 })
export class OtpTrackingProcessor extends WorkerHost {
  constructor(private readonly sms: SmsGatewayService) {
    super();
  }

  async process(job: Job<OtpiqTrackingJob>) {
    if (job.name === 'track')
      await this.sms.trackAcceptedOtpiq(job.data.smsId, job.data.phone);
  }
}
