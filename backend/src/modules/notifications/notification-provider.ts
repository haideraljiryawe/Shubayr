import { Logger } from '@nestjs/common';
import { createHash, createSign, randomUUID } from 'node:crypto';

export type NotificationProviderResult = { messageId: string };

export interface NotificationProvider {
  send(input: {
    recipient: string;
    title: string;
    body: string;
  }): Promise<NotificationProviderResult>;
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

type FcmServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type FcmErrorResponse = {
  name?: string;
  error?: {
    status?: string;
    details?: Array<{ errorCode?: string }>;
  };
};

export class NotificationDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(code);
    this.name = NotificationDeliveryError.name;
  }
}

export class InvalidNotificationRecipientError extends NotificationDeliveryError {
  constructor() {
    super('FCM_UNREGISTERED', false);
    this.name = InvalidNotificationRecipientError.name;
  }
}

export function maskedRecipientId(recipient: string): string {
  return createHash('sha256').update(recipient).digest('hex').slice(0, 12);
}

export class FcmPushProvider implements NotificationProvider {
  private readonly credentials: FcmServiceAccount;
  private accessToken?: { value: string; expiresAt: number };

  constructor(
    serviceAccountJsonBase64: string,
    private readonly projectId: string,
    private readonly http: typeof fetch = fetch,
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        Buffer.from(serviceAccountJsonBase64, 'base64').toString('utf8'),
      );
    } catch {
      throw new Error(
        'FCM_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64 JSON',
      );
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('client_email' in parsed) ||
      !('private_key' in parsed) ||
      !('project_id' in parsed) ||
      typeof parsed.client_email !== 'string' ||
      typeof parsed.private_key !== 'string' ||
      typeof parsed.project_id !== 'string'
    ) {
      throw new Error('FCM service-account JSON is missing required fields');
    }
    this.credentials = parsed as FcmServiceAccount;
    if (this.credentials.project_id !== projectId) {
      throw new Error('FCM_PROJECT_ID does not match the service account');
    }
  }

  async diagnose(): Promise<{ projectId: string; authenticated: true }> {
    await this.getAccessToken();
    return { projectId: this.projectId, authenticated: true };
  }

  async send(input: {
    recipient: string;
    title: string;
    body: string;
  }): Promise<NotificationProviderResult> {
    let response: Response;
    try {
      response = await this.http(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await this.getAccessToken()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: input.recipient,
              notification: { title: input.title, body: input.body },
              // This sender builds visible notifications; sound is APNs-only.
              apns: { payload: { aps: { sound: 'default' } } },
            },
          }),
        },
      );
    } catch (error) {
      if (error instanceof NotificationDeliveryError) throw error;
      throw new NotificationDeliveryError('FCM_NETWORK_ERROR', true);
    }

    const payload = (await response
      .json()
      .catch(() => ({}))) as FcmErrorResponse;
    if (response.ok) {
      return { messageId: payload.name ?? `accepted-${randomUUID()}` };
    }

    const codes = new Set(
      payload.error?.details
        ?.map((detail) => detail.errorCode)
        .filter((code): code is string => Boolean(code)) ?? [],
    );
    if (codes.has('UNREGISTERED')) {
      throw new InvalidNotificationRecipientError();
    }
    if (response.status === 429 || response.status >= 500) {
      throw new NotificationDeliveryError(
        response.status === 429 ? 'FCM_RATE_LIMITED' : 'FCM_UNAVAILABLE',
        true,
        retryAfterMilliseconds(response.headers?.get('retry-after')),
      );
    }
    if (
      codes.has('INVALID_ARGUMENT') ||
      payload.error?.status === 'INVALID_ARGUMENT'
    ) {
      // INVALID_ARGUMENT can describe our payload, not the registration token.
      // Only FCM's explicit UNREGISTERED code is allowed to retire a token.
      throw new NotificationDeliveryError('FCM_INVALID_ARGUMENT', false);
    }
    throw new NotificationDeliveryError(
      `FCM_${payload.error?.status ?? `HTTP_${response.status}`}`,
      false,
    );
  }

  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessToken.expiresAt > now + 60) {
      return this.accessToken.value;
    }
    const tokenUri =
      this.credentials.token_uri ?? 'https://oauth2.googleapis.com/token';
    const encoded = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encoded({ alg: 'RS256', typ: 'JWT' })}.${encoded({
      iss: this.credentials.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const assertion = `${unsigned}.${signer
      .sign(this.credentials.private_key)
      .toString('base64url')}`;
    let response: Response;
    try {
      response = await this.http(tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      });
    } catch {
      throw new NotificationDeliveryError('FCM_AUTH_NETWORK_ERROR', true);
    }
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !payload.access_token) {
      throw new NotificationDeliveryError(
        response.status === 429 || response.status >= 500
          ? 'FCM_AUTH_UNAVAILABLE'
          : 'FCM_AUTH_REJECTED',
        response.status === 429 || response.status >= 500,
        retryAfterMilliseconds(response.headers?.get('retry-after')),
      );
    }
    this.accessToken = {
      value: payload.access_token,
      expiresAt: now + (payload.expires_in ?? 3600),
    };
    return payload.access_token;
  }
}

export class DevPushProvider implements NotificationProvider {
  private readonly logger = new Logger(DevPushProvider.name);
  send(input: {
    recipient: string;
    title: string;
    body: string;
  }): Promise<NotificationProviderResult> {
    const messageId = `dev-${randomUUID()}`;
    this.logger.log(
      `DEV push accepted recipient=${maskedRecipientId(input.recipient)} message=${messageId}`,
    );
    return Promise.resolve({ messageId });
  }
}

export class DevSmsProvider implements NotificationProvider {
  private readonly logger = new Logger(DevSmsProvider.name);
  send(input: {
    recipient: string;
    title: string;
    body: string;
  }): Promise<NotificationProviderResult> {
    const messageId = `dev-${randomUUID()}`;
    this.logger.log(
      `DEV SMS accepted recipient=${maskedRecipientId(input.recipient)} message=${messageId}`,
    );
    return Promise.resolve({ messageId });
  }
}

export class DisabledNotificationProvider implements NotificationProvider {
  send(): Promise<NotificationProviderResult> {
    return Promise.reject(
      new NotificationDeliveryError('NOTIFICATION_PROVIDER_DISABLED', false),
    );
  }
}

function retryAfterMilliseconds(value: string | null | undefined) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}
