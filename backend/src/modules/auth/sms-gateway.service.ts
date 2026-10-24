import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as delay } from 'node:timers/promises';

const OTPIQ_SMS_URL = 'https://api.otpiq.com/api/sms';

@Injectable()
export class SmsGatewayService {
  constructor(private readonly config: ConfigService) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.config.get<string>('APP_ENV') === 'development') return;

    if (this.config.get<string>('SMS_PROVIDER', 'gateway') === 'otpiq') {
      return this.sendViaOtpiq(phone, code);
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
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.unavailable();
    }
  }

  private async sendViaOtpiq(phone: string, code: string): Promise<void> {
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
    ): Promise<Record<string, unknown>> => {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
        redirect: 'error',
      });
      // Includes insufficient credit, credentials, 429, and provider failures.
      // Never expose provider bodies, keys, codes, or transport exceptions.
      if (!response.ok) this.unavailable();
      const body: unknown = await response.json();
      if (controller.signal.aborted) this.unavailable();
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        this.unavailable();
      }
      return body as Record<string, unknown>;
    };

    try {
      // Do not retry POST: a timeout may still have submitted a billable SMS.
      const submitted = await request(OTPIQ_SMS_URL, {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber,
          smsType: 'verification',
          provider: 'sms',
          verificationCode: code,
        }),
      });
      if (
        typeof submitted.smsId !== 'string' ||
        !/^sms-[a-zA-Z0-9_-]{1,128}$/.test(submitted.smsId) ||
        submitted.canCover !== true
      )
        this.unavailable();

      // A created task is only queued. Confirm SMS dispatch through tracking
      // before AuthService persists the OTP and returns its existing otp_sent.
      while (!controller.signal.aborted) {
        const tracked = await request(
          `${OTPIQ_SMS_URL}/track/${encodeURIComponent(submitted.smsId)}`,
          { method: 'GET' },
        );
        if (
          tracked.smsId !== submitted.smsId ||
          tracked.phoneNumber !== phoneNumber
        )
          this.unavailable();
        if (
          (tracked.status === 'sent' || tracked.status === 'delivered') &&
          typeof tracked.isFinalStatus === 'boolean' &&
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
          return;
        if (tracked.status !== 'pending' || tracked.isFinalStatus !== false)
          this.unavailable();
        await delay(500, undefined, { signal: controller.signal });
      }
      this.unavailable();
    } catch {
      this.unavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private unavailable(): never {
    throw new ServiceUnavailableException({
      status: 503,
      code: 'OTP_DELIVERY_UNAVAILABLE',
      message: 'OTP delivery is unavailable',
      errors: [],
    });
  }
}
