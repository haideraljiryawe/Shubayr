import { Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';

export interface NotificationProvider {
  send(input: {
    recipient: string;
    title: string;
    body: string;
  }): Promise<void>;
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
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{ errorCode?: string }>;
  };
};

export class InvalidNotificationRecipientError extends Error {
  constructor(message = 'Push token is no longer registered') {
    super(message);
    this.name = InvalidNotificationRecipientError.name;
  }
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

  async send(input: { recipient: string; title: string; body: string }) {
    const response = await this.http(
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
          },
        }),
      },
    );
    if (response.ok) return;

    const payload = (await response
      .json()
      .catch(() => ({}))) as FcmErrorResponse;
    const codes = payload.error?.details
      ?.map((detail) => detail.errorCode)
      .filter((code): code is string => Boolean(code));
    if (
      codes?.some((code) => ['UNREGISTERED', 'INVALID_ARGUMENT'].includes(code))
    ) {
      throw new InvalidNotificationRecipientError();
    }
    throw new Error(
      `FCM request failed (${response.status} ${payload.error?.status ?? 'UNKNOWN'}): ${payload.error?.message ?? 'no message'}`,
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
    const response = await this.http(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new Error(
        `FCM OAuth token request failed (${response.status}): ${payload.error_description ?? 'no access token'}`,
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
