import { generateKeyPairSync } from 'node:crypto';
import {
  FcmPushProvider,
  InvalidNotificationRecipientError,
  NotificationDeliveryError,
} from './notification-provider';

function serviceAccount() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return Buffer.from(
    JSON.stringify({
      client_email: 'push@shubayr.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      project_id: 'shubayr-production',
      token_uri: 'https://oauth2.googleapis.com/token',
    }),
  ).toString('base64');
}

function response(ok: boolean, status: number, payload: unknown) {
  return {
    ok,
    status,
    headers: new Headers(),
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('FcmPushProvider', () => {
  it('uses a service-account OAuth token and sends an HTTP v1 notification', async () => {
    const http = jest
      .fn()
      .mockResolvedValueOnce(
        response(true, 200, { access_token: 'oauth-token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(response(true, 200, { name: 'message-1' }));
    const provider = new FcmPushProvider(
      serviceAccount(),
      'shubayr-production',
      http,
    );

    await expect(
      provider.send({
        recipient: 'registration-token',
        title: 'Order update',
        body: 'Your order is ready.',
      }),
    ).resolves.toEqual({ messageId: 'message-1' });

    expect(http).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(URLSearchParams) as URLSearchParams,
      }),
    );
    expect(http).toHaveBeenNthCalledWith(
      2,
      'https://fcm.googleapis.com/v1/projects/shubayr-production/messages:send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer oauth-token',
        }) as Record<string, string>,
        body: JSON.stringify({
          message: {
            token: 'registration-token',
            notification: {
              title: 'Order update',
              body: 'Your order is ready.',
            },
          },
        }),
      }),
    );
  });

  it('does not classify payload INVALID_ARGUMENT as an invalid token', async () => {
    const http = jest
      .fn()
      .mockResolvedValueOnce(
        response(true, 200, { access_token: 'oauth-token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        response(false, 400, {
          error: {
            status: 'INVALID_ARGUMENT',
            details: [{ errorCode: 'INVALID_ARGUMENT' }],
          },
        }),
      );
    const provider = new FcmPushProvider(
      serviceAccount(),
      'shubayr-production',
      http,
    );

    await expect(
      provider.send({ recipient: 'still-valid', title: 'Title', body: 'Body' }),
    ).rejects.toMatchObject({
      code: 'FCM_INVALID_ARGUMENT',
      retryable: false,
    });
  });

  it.each([
    [429, 'FCM_RATE_LIMITED'],
    [503, 'FCM_UNAVAILABLE'],
  ])(
    'classifies HTTP %s as retryable without provider text',
    async (status, code) => {
      const http = jest
        .fn()
        .mockResolvedValueOnce(
          response(true, 200, {
            access_token: 'oauth-token',
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          response(false, status, {
            error: { status: 'UNAVAILABLE', message: 'token=secret-token' },
          }),
        );
      const provider = new FcmPushProvider(
        serviceAccount(),
        'shubayr-production',
        http,
      );

      await expect(
        provider.send({
          recipient: 'secret-token',
          title: 'Title',
          body: 'Body',
        }),
      ).rejects.toEqual(expect.objectContaining({ code, retryable: true }));
    },
  );

  it('classifies network failures as retryable with a sanitized code', async () => {
    const http = jest
      .fn()
      .mockResolvedValueOnce(
        response(true, 200, { access_token: 'oauth-token', expires_in: 3600 }),
      )
      .mockRejectedValueOnce(new Error('request contained secret-token'));
    const provider = new FcmPushProvider(
      serviceAccount(),
      'shubayr-production',
      http,
    );

    const caught = await provider
      .send({ recipient: 'secret-token', title: 'Title', body: 'Body' })
      .catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(NotificationDeliveryError);
    expect(caught).toMatchObject({
      code: 'FCM_NETWORK_ERROR',
      retryable: true,
    });
    expect(String(caught)).not.toContain('secret-token');
  });

  it('identifies an unregistered token so the caller can remove it', async () => {
    const http = jest
      .fn()
      .mockResolvedValueOnce(
        response(true, 200, { access_token: 'oauth-token', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(
        response(false, 404, {
          error: {
            status: 'NOT_FOUND',
            details: [{ errorCode: 'UNREGISTERED' }],
          },
        }),
      );
    const provider = new FcmPushProvider(
      serviceAccount(),
      'shubayr-production',
      http,
    );

    await expect(
      provider.send({ recipient: 'expired', title: 'Title', body: 'Body' }),
    ).rejects.toBeInstanceOf(InvalidNotificationRecipientError);
  });

  it('rejects a project/service-account mismatch without exposing the secret', () => {
    expect(
      () => new FcmPushProvider(serviceAccount(), 'wrong-project'),
    ).toThrow('FCM_PROJECT_ID does not match the service account');
  });
});
