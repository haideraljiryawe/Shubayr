import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsGatewayService {
  constructor(private readonly config: ConfigService) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.config.get<string>('APP_ENV') === 'development') return;

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

  private unavailable(): never {
    throw new ServiceUnavailableException({
      status: 503,
      code: 'OTP_DELIVERY_UNAVAILABLE',
      message: 'OTP delivery is unavailable',
      errors: [],
    });
  }
}
