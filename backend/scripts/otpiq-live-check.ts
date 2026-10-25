import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import { isIP } from 'node:net';
import process from 'node:process';
import {
  SmsDeliveryUnavailableException,
  SmsGatewayService,
} from '../src/modules/auth/sms-gateway.service';

type Output = Pick<Console, 'log' | 'error'>;

export async function runOtpiqLiveCheck(
  args: string[],
  environment: NodeJS.ProcessEnv,
  output: Output = console,
): Promise<number> {
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  const phone = value('--phone');
  const requesterIp = value('--requester-ip');
  const trackSmsId = value('--track');
  const key = environment.OTPIQ_API_KEY?.trim();
  if (!key) throw new Error('OTPIQ_API_KEY is required in the environment');
  if (!phone || !/^\+[1-9][0-9]{9,14}$/.test(phone)) {
    throw new Error('--phone must be a 10-15 digit E.164 number');
  }
  if (trackSmsId && !/^sms-[a-fA-F0-9]{24}$/.test(trackSmsId))
    throw new Error('--track must be an OTPIQ smsId');
  if (requesterIp && isIP(requesterIp) === 0) {
    throw new Error('--requester-ip must be a valid IPv4 or IPv6 address');
  }
  if (
    !trackSmsId &&
    key.startsWith('sk_live_') &&
    !args.includes('--allow-live')
  ) {
    throw new Error('A live OTPIQ key requires the explicit --allow-live flag');
  }

  const config = new ConfigService({
    APP_ENV: 'production',
    SMS_PROVIDER: 'otpiq',
    OTPIQ_API_KEY: key,
    OTPIQ_TIMEOUT_MS: Number(environment.OTPIQ_TIMEOUT_MS ?? 10_000),
  });
  const service = new SmsGatewayService(config);
  const started = performance.now();
  try {
    if (trackSmsId) {
      const tracked = await service.inspectOtpiqTracking(trackSmsId, phone);
      output.log(`smsId: ${tracked.smsId}`);
      output.log(`status: ${tracked.status}`);
      output.log(`is final status: ${String(tracked.isFinalStatus)}`);
      output.log(`last channel: ${tracked.lastChannel ?? 'not returned'}`);
      output.log(
        `channel flow: ${
          tracked.channelFlow.length > 0
            ? tracked.channelFlow
                .map(
                  (entry) =>
                    `${entry.channel}(tried=${String(entry.tried)},success=${String(entry.success)})`,
                )
                .join(',')
            : 'empty'
        }`,
      );
      output.log(`phone matched: ${String(tracked.phoneNumberMatched)}`);
      output.log('anti-fraud field: not sent (track mode)');
    } else {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const result = await service.sendOtpWithResult(phone, code, requesterIp);
      output.log(`smsId: ${result.smsId ?? 'not returned'}`);
      output.log(`final status: ${result.finalStatus ?? 'unknown'}`);
      output.log(`cost: ${result.cost ?? 'not returned'}`);
      output.log(
        `remaining credit: ${result.remainingCredit ?? 'not returned'}`,
      );
      output.log(
        `anti-fraud field: ${requesterIp ? 'antiFraud.requesterIp' : 'omitted'}`,
      );
      if (key.startsWith('sk_dev_'))
        output.log('note: dev key — delivered to the dashboard dev phone');
    }
    output.log(`latency_ms: ${Math.round(performance.now() - started)}`);
    return 0;
  } catch (error) {
    if (!(error instanceof SmsDeliveryUnavailableException)) throw error;
    output.error(`reason: ${error.diagnostic.reason}`);
    if (error.diagnostic.httpStatus !== undefined)
      output.error(`http status: ${error.diagnostic.httpStatus}`);
    if (error.diagnostic.smsId)
      output.error(`smsId: ${error.diagnostic.smsId}`);
    output.error(`latency_ms: ${Math.round(performance.now() - started)}`);
    return 1;
  }
}

if (require.main === module) {
  runOtpiqLiveCheck(process.argv.slice(2), process.env)
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      // Deliberately print only our fixed validation/provider message. The API
      // key, generated code, phone and raw provider response are never included.
      const message =
        error instanceof Error ? error.message : 'OTPIQ check failed';
      console.error(message);
      process.exitCode = 1;
    });
}
