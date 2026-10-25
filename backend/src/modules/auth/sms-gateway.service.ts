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

export type SmsDeliveryFailureDiagnostic = {
  reason: string;
  httpStatus?: number;
  smsId?: string;
};

export type OtpiqTrackingSnapshot = {
  smsId: string;
  status: string;
  isFinalStatus: boolean | null;
  lastChannel: string | null;
  channelFlow: Array<{
    channel: string;
    tried: boolean | null;
    success: boolean | null;
  }>;
  phoneNumberMatched: boolean;
};

export class SmsDeliveryUnavailableException extends ServiceUnavailableException {
  constructor(readonly diagnostic: SmsDeliveryFailureDiagnostic) {
    super({
      status: 503,
      code: 'OTP_DELIVERY_UNAVAILABLE',
      message: 'OTP delivery is unavailable',
      message_ar: 'خدمة إرسال رمز التحقق غير متاحة حالياً',
      message_en: 'OTP delivery is unavailable',
      errors: [],
    });
  }
}

// OTPIQ documents two spellings in different places. Keep this one function
// as the only switch point until the controlled live check confirms the
// dashboard's camelCase form.
export function otpiqAntiFraud(
  requesterIp?: string,
): { antiFraud: { requesterIp: string } } | Record<string, never> {
  return requesterIp && isIP(requesterIp) ? { antiFraud: { requesterIp } } : {};
}

function safeProviderToken(value: unknown, fallback = 'unknown'): string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(value)
    ? value
    : fallback;
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
      if (!response.ok)
        this.unavailable(`Gateway rejected with HTTP ${response.status}`, {
          httpStatus: response.status,
        });
      return { provider: 'gateway', finalStatus: 'accepted' };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.unavailable('Gateway transport failure');
    }
  }

  async inspectOtpiqTracking(
    smsId: string,
    phone: string,
  ): Promise<OtpiqTrackingSnapshot> {
    const key = this.config.get<string>('OTPIQ_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException({
        status: 503,
        code: 'SMS_NOT_CONFIGURED',
        message: 'SMS delivery is not configured',
        errors: [],
      });
    }
    if (!/^sms-[a-fA-F0-9]{24}$/.test(smsId))
      this.unavailable('OTPIQ tracking smsId invalid');
    if (!/^\+[1-9][0-9]{9,14}$/.test(phone))
      this.unavailable('OTPIQ phone not E.164', { smsId });

    let response: Response;
    const signal = AbortSignal.timeout(
      this.config.get<number>('OTPIQ_TIMEOUT_MS', 10_000),
    );
    try {
      response = await fetch(
        `${OTPIQ_SMS_URL}/track/${encodeURIComponent(smsId)}`,
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
          },
          redirect: 'error',
          signal,
        },
      );
    } catch {
      this.unavailable(
        signal.aborted
          ? 'OTPIQ tracking deadline expired'
          : 'OTPIQ tracking transport failure',
        { smsId },
      );
    }
    if (!response.ok)
      this.unavailable(`OTPIQ tracking rejected with HTTP ${response.status}`, {
        httpStatus: response.status,
        smsId,
      });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.unavailable('OTPIQ tracking response JSON invalid', {
        httpStatus: response.status,
        smsId,
      });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      this.unavailable('OTPIQ tracking response not an object', {
        httpStatus: response.status,
        smsId,
      });
    const tracked = body as Record<string, unknown>;
    if (tracked.smsId !== smsId)
      this.unavailable('OTPIQ tracking smsId mismatch', {
        httpStatus: response.status,
        smsId,
      });
    return {
      smsId,
      status: safeProviderToken(tracked.status),
      isFinalStatus:
        typeof tracked.isFinalStatus === 'boolean'
          ? tracked.isFinalStatus
          : null,
      lastChannel:
        typeof tracked.lastChannel === 'string'
          ? safeProviderToken(tracked.lastChannel, 'invalid')
          : null,
      channelFlow: this.channelFlowSummary(tracked.channelFlow),
      phoneNumberMatched: tracked.phoneNumber === phone.slice(1),
    };
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
    if (!/^\+[1-9][0-9]{9,14}$/.test(phone))
      this.unavailable('OTPIQ phone not E.164');
    const phoneNumber = phone.slice(1);
    const developmentKey = key.startsWith('sk_dev_');
    let submittedSmsId: string | undefined;
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
    ): Promise<{ body: Record<string, unknown>; httpStatus: number }> => {
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers,
          signal: controller.signal,
          redirect: 'error',
        });
      } catch {
        this.unavailable(
          controller.signal.aborted
            ? `OTPIQ ${stage} deadline expired`
            : `OTPIQ ${stage} transport failure`,
          { ...(submittedSmsId ? { smsId: submittedSmsId } : {}) },
        );
      }
      // Includes insufficient credit, credentials, 429, and provider failures.
      // Never expose provider bodies, keys, codes, or transport exceptions.
      if (!response.ok) {
        this.unavailable(
          `OTPIQ ${stage} rejected with HTTP ${response.status}`,
          {
            httpStatus: response.status,
            ...(submittedSmsId ? { smsId: submittedSmsId } : {}),
          },
        );
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        this.unavailable(`OTPIQ ${stage} response JSON invalid`, {
          httpStatus: response.status,
          ...(submittedSmsId ? { smsId: submittedSmsId } : {}),
        });
      }
      if (controller.signal.aborted)
        this.unavailable(`OTPIQ ${stage} deadline expired`, {
          httpStatus: response.status,
          ...(submittedSmsId ? { smsId: submittedSmsId } : {}),
        });
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        this.unavailable(`OTPIQ ${stage} response not an object`, {
          httpStatus: response.status,
          ...(submittedSmsId ? { smsId: submittedSmsId } : {}),
        });
      }
      return {
        body: body as Record<string, unknown>,
        httpStatus: response.status,
      };
    };

    try {
      // Do not retry POST: a timeout may still have submitted a billable SMS.
      const submission = await request(
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
      const submitted = submission.body;
      if (
        typeof submitted.smsId === 'string' &&
        /^sms-[a-fA-F0-9]{24}$/.test(submitted.smsId)
      )
        submittedSmsId = submitted.smsId;
      if (!submittedSmsId || submitted.canCover !== true)
        this.unavailable('OTPIQ submission response was invalid or unfunded', {
          httpStatus: submission.httpStatus,
          ...(submittedSmsId ? { smsId: submittedSmsId } : {}),
        });

      // A created task is only queued. Confirm SMS dispatch through tracking
      // before AuthService persists the OTP and returns its existing otp_sent.
      while (!controller.signal.aborted) {
        const tracking = await request(
          `${OTPIQ_SMS_URL}/track/${encodeURIComponent(submittedSmsId)}`,
          { method: 'GET' },
          'tracking',
        );
        const tracked = tracking.body;
        if (tracked.smsId !== submittedSmsId)
          this.unavailable('OTPIQ tracking smsId mismatch', {
            httpStatus: tracking.httpStatus,
            smsId: submittedSmsId,
          });
        if (!developmentKey && tracked.phoneNumber !== phoneNumber)
          this.unavailable('OTPIQ tracking phone mismatch', {
            httpStatus: tracking.httpStatus,
            smsId: submittedSmsId,
          });
        const finalSent =
          (tracked.status === 'sent' || tracked.status === 'delivered') &&
          tracked.isFinalStatus === true;
        const smsSucceeded =
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
          });
        if (finalSent && smsSucceeded)
          return {
            provider: 'otpiq',
            smsId: submittedSmsId,
            finalStatus: String(tracked.status),
            ...(typeof submitted.cost === 'number'
              ? { cost: submitted.cost }
              : {}),
            ...(typeof submitted.remainingCredit === 'number'
              ? { remainingCredit: submitted.remainingCredit }
              : {}),
          };
        if (finalSent)
          this.unavailable('OTPIQ tracking unexpected channel', {
            httpStatus: tracking.httpStatus,
            smsId: submittedSmsId,
          });
        if (
          !['pending', 'sent', 'delivered'].includes(String(tracked.status)) ||
          tracked.isFinalStatus !== false
        )
          this.unavailable(
            `OTPIQ tracking unexpected status ${safeProviderToken(tracked.status)}/${typeof tracked.isFinalStatus === 'boolean' ? String(tracked.isFinalStatus) : 'invalid'}`,
            { httpStatus: tracking.httpStatus, smsId: submittedSmsId },
          );
        await delay(500, undefined, { signal: controller.signal });
      }
      this.unavailable('OTPIQ tracking deadline expired', {
        smsId: submittedSmsId,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.unavailable(
        controller.signal.aborted
          ? 'OTPIQ tracking deadline expired'
          : 'OTPIQ tracking transport failure',
        { ...(submittedSmsId ? { smsId: submittedSmsId } : {}) },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private channelFlowSummary(
    value: unknown,
  ): OtpiqTrackingSnapshot['channelFlow'] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        return [];
      const channel = entry as Record<string, unknown>;
      return [
        {
          channel: safeProviderToken(channel.channel),
          tried: typeof channel.tried === 'boolean' ? channel.tried : null,
          success:
            typeof channel.success === 'boolean' ? channel.success : null,
        },
      ];
    });
  }

  private unavailable(
    reason: string,
    metadata: Omit<SmsDeliveryFailureDiagnostic, 'reason'> = {},
  ): never {
    this.logger.warn(reason);
    throw new SmsDeliveryUnavailableException({ reason, ...metadata });
  }
}
