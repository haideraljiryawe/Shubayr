import { Logger } from '@nestjs/common';

export interface NotificationProvider {
  send(input: {
    recipient: string;
    title: string;
    body: string;
  }): Promise<void>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export class DevPushProvider implements NotificationProvider {
  private readonly logger = new Logger(DevPushProvider.name);
  send(input: {
    recipient: string;
    title: string;
    body: string;
  }): Promise<void> {
    this.logger.log(
      `DEV push dispatched: ${input.title} (${input.recipient.length} token characters)`,
    );
    return Promise.resolve();
  }
}

export class DevSmsProvider implements NotificationProvider {
  private readonly logger = new Logger(DevSmsProvider.name);
  send(input: {
    recipient: string;
    title: string;
    body: string;
  }): Promise<void> {
    this.logger.log(
      `DEV SMS dispatched: ${input.title} (${input.recipient.slice(-4)})`,
    );
    return Promise.resolve();
  }
}

export class DisabledNotificationProvider implements NotificationProvider {
  send(): Promise<void> {
    return Promise.reject(new Error('Notification gateway is not configured'));
  }
}
