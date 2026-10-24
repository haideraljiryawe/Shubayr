import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const OTPIQ_SMS_URL = 'https://api.otpiq.com/api/sms';

export type SmsDeliveryResult = {
  provider: 'development' | 'gateway' | 'otpiq';
  smsId?: string;
  finalStatus?: string;
  cost?: number;
  remainingCredit?: number;
};

// OTPIQ documents two spellings in different places. Keep this one function
// as the only switch point until the controlled live check confirms the
// dashboard's camelCase form.
export function otpiqAntiFraud(
  requesterIp?: string,
): { antiFraud: { requesterIp: string } } | Record<string, never> {
  return requesterIp && isIP(requesterIp) ? { antiFraud: { requesterIp } } : {};
}

@Injectable()
export class SmsGatewayService {
  private readonly logger = new Logger(SmsGatewayService.name);

  constructor(private readonly config: ConfigService) {}

  async sendOtp(
    phone: string,
    code: string,
    requesterIp?: string,
  ): Promise<void> {
    await this.sendOtpWithResult(phone, code, requesterIp);
  }

  async sendOtpWithResult(
    phone: string,
    code: string,
    requesterIp?: string,
  ): Promise<SmsDeliveryResult> {
    if (this.config.get<string>('APP_ENV') === 'development') {
      return { provider: 'development', finalStatus: 'skipped' };
    }

    if (this.config.get<string>('SMS_PROVIDER', 'gateway') === 'otpiq') {
      return this.sendViaOtpiq(phone, code, requesterIp);
    }

    const url = this.config.getOrThrow<string>('SMS_GATEWAY_URL');
    if (url === 'disabled') {
      throw new ServiceUnavailableException({
        status: 503,
        code: 'SMS_NOT_CONFIGURED',
        message: 'SMS delivery is not configured',
        errors: [],
      });
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.getOrThrow<string>('SMS_GATEWAY_TOKEN')}`,
        },
        body: JSON.stringify({ phone, code }),
        signal: AbortSignal.timeout(
          this.config.get<number>('SMS_GATEWAY_TIMEOUT_MS', 10_000),
        ),
      });
      if (!response.ok) this.unavailable();
      return { provider: 'gateway', finalStatus: 'accepted' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.unavailable('Gateway transport failure');
    }
  }

  private async sendViaOtpiq(
    phone: string,
    code: string,
    requesterIp?: string,
  ): Promise<SmsDeliveryResult> {
    const key = this.config.get<string>('OTPIQ_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException({
        status: 503,
        code: 'SMS_NOT_CONFIGURED',
        message: 'SMS delivery is not configured',
        errors: [],
      });
    }

    // Flutter already converts Iraqi national input to E.164. Never rewrite
    // the stored/login identity or infer a country for an ambiguous number.
    if (!/^\+[1-9][0-9]{9,14}$/.test(phone)) this.unavailable();
    const phoneNumber = phone.slice(1);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.get<number>('OTPIQ_TIMEOUT_MS', 10_000),
    );
    const headers = {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    };
    const request = async (
      url: string,
      init: RequestInit,
      stage: 'submission' | 'tracking',
    ): Promise<Record<string, unknown>> => {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: 'error',
      });
      // Includes insufficient credit, credentials, 429, and provider failures.
      // Never expose provider bodies, keys, codes, or transport exceptions.
      if (!response.ok) {
        this.unavailable(
          `OTPIQ ${stage} rejected with HTTP ${response.status}`,
        );
      }
      const body: unknown = await response.json();
      if (controller.signal.aborted) this.unavailable();
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        this.unavailable();
      }
      return body as Record<string, unknown>;
    };

    try {
      // Do not retry POST: a timeout may still have submitted a billable SMS.
      const submitted = await request(
        OTPIQ_SMS_URL,
        {
          method: 'POST',
          body: JSON.stringify({
            phoneNumber,
            smsType: 'verification',
            provider: 'sms',
            verificationCode: code,
            ...otpiqAntiFraud(requesterIp),
          }),
        },
        'submission',
      );
      if (
        typeof submitted.smsId !== 'string' ||
        !/^sms-[a-fA-F0-9]{24}$/.test(submitted.smsId) ||
        submitted.canCover !== true
      )
        this.unavailable('OTPIQ submission response was invalid or unfunded');

      // A created task is only queued. Confirm SMS dispatch through tracking
      // before AuthService persists the OTP and returns its existing otp_sent.
      while (!controller.signal.aborted) {
        const tracked = await request(
          `${OTPIQ_SMS_URL}/track/${encodeURIComponent(submitted.smsId)}`,
          { method: 'GET' },
          'tracking',
        );
        if (
          tracked.smsId !== submitted.smsId ||
          tracked.phoneNumber !== phoneNumber
        )
          this.unavailable();
        if (
          (tracked.status === 'sent' || tracked.status === 'delivered') &&
          tracked.isFinalStatus === true &&
          tracked.lastChannel === 'sms' &&
          Array.isArray(tracked.channelFlow) &&
          tracked.channelFlow.some((channel: unknown) => {
            if (!channel || typeof channel !== 'object') return false;
            const result = channel as Record<string, unknown>;
            return (
              result.channel === 'sms' &&
              result.tried === true &&
              result.success === true
            );
          })
        )
          return {
            provider: 'otpiq',
            smsId: submitted.smsId,
            finalStatus: String(tracked.status),
            ...(typeof submitted.cost === 'number'
              ? { cost: submitted.cost }
              : {}),
            ...(typeof submitted.remainingCredit === 'number'
              ? { remainingCredit: submitted.remainingCredit }
              : {}),
          };
        if (
          !['pending', 'sent', 'delivered'].includes(String(tracked.status)) ||
          tracked.isFinalStatus !== false
        )
          this.unavailable();
        await delay(500, undefined, { signal: controller.signal });
      }
      this.unavailable();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.unavailable(
        controller.signal.aborted
          ? 'OTPIQ request deadline expired'
          : 'OTPIQ transport or response failure',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private unavailable(reason?: string): never {
    if (reason) this.logger.warn(reason);
    throw new ServiceUnavailableException({
      status: 503,
      code: 'OTP_DELIVERY_UNAVAILABLE',
      message: 'OTP delivery is unavailable',
      message_ar: 'خدمة إرسال رمز التحقق غير متاحة حالياً',
      message_en: 'OTP delivery is unavailable',
      errors: [],
    });
  }
}
