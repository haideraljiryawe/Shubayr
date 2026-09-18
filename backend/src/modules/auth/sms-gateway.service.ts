import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsGatewayService {
  constructor(private readonly config: ConfigService) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.config.get<string>('APP_ENV') === 'development') return;

    const response = await fetch(
      this.config.getOrThrow<string>('SMS_GATEWAY_URL'),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.getOrThrow<string>('SMS_GATEWAY_TOKEN')}`,
        },
        body: JSON.stringify({ phone, code }),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException('OTP delivery is unavailable');
    }
  }
}
