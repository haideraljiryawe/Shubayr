import { generateKeyPairSync } from 'node:crypto';
import {
  FcmPushProvider,
  InvalidNotificationRecipientError,
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

    await provider.send({
      recipient: 'registration-token',
      title: 'Order update',
      body: 'Your order is ready.',
    });

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
