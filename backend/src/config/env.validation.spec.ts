import { validateEnvironment } from './env.validation';

const production = {
  APP_ENV: 'production',
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/shubayr',
  REDIS_URL: 'redis://localhost:6379',
  MEILI_HOST: 'http://localhost:7700',
  MEILI_MASTER_KEY: 'master-key-at-least-sixteen',
  JWT_SECRET: 'access-secret-at-least-thirty-two-characters',
  JWT_REFRESH_SECRET: 'refresh-secret-at-least-thirty-two-characters',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'access-key',
  S3_SECRET_KEY: 'secret-key',
};

describe('validateEnvironment SMS gateway', () => {
  it('accepts the explicit disabled production mode without a token', () => {
    const result = validateEnvironment({
      ...production,
      SMS_GATEWAY_URL: 'disabled',
      SMS_GATEWAY_TOKEN: '',
    });
    expect(result.SMS_GATEWAY_URL).toBe('disabled');
    expect(result.SMS_GATEWAY_TIMEOUT_MS).toBe(10_000);
    expect(result.ADMIN_REFRESH_ROTATION_GRACE_SECONDS).toBe(30);
  });

  it('requires a token for a configured production gateway', () => {
    expect(() =>
      validateEnvironment({
        ...production,
        SMS_GATEWAY_URL: 'https://sms.example.test/send',
        SMS_GATEWAY_TOKEN: '',
      }),
    ).toThrow(/SMS_GATEWAY_TOKEN/);
  });

  it('rejects a timeout below the safe lower bound', () => {
    expect(() =>
      validateEnvironment({
        ...production,
        SMS_GATEWAY_URL: 'disabled',
        SMS_GATEWAY_TIMEOUT_MS: 999,
      }),
    ).toThrow(/SMS_GATEWAY_TIMEOUT_MS/);
  });

  it('bounds the Admin refresh concurrency grace', () => {
    expect(() =>
      validateEnvironment({
        ...production,
        SMS_GATEWAY_URL: 'disabled',
        ADMIN_REFRESH_ROTATION_GRACE_SECONDS: 121,
      }),
    ).toThrow(/ADMIN_REFRESH_ROTATION_GRACE_SECONDS/);
  });
});

describe('validateEnvironment OTPIQ', () => {
  it('accepts OTPIQ without legacy gateway configuration', () => {
    const result = validateEnvironment({
      ...production,
      SMS_PROVIDER: 'otpiq',
      OTPIQ_API_KEY: 'test-project-key',
    });
    expect(result.SMS_PROVIDER).toBe('otpiq');
    expect(result.OTPIQ_TIMEOUT_MS).toBe(10_000);
  });

  it.each([undefined, '', 'short', '        '])(
    'requires a nonempty OTPIQ key (%#)',
    (key) => {
      expect(() =>
        validateEnvironment({
          ...production,
          SMS_PROVIDER: 'otpiq',
          OTPIQ_API_KEY: key,
        }),
      ).toThrow(/OTPIQ_API_KEY/);
    },
  );

  it.each([999, 15001, 1000.5])(
    'rejects an unsafe total timeout %s',
    (timeout) => {
      expect(() =>
        validateEnvironment({
          ...production,
          SMS_PROVIDER: 'otpiq',
          OTPIQ_API_KEY: 'test-project-key',
          OTPIQ_TIMEOUT_MS: timeout,
        }),
      ).toThrow(/OTPIQ_TIMEOUT_MS/);
    },
  );

  it('rejects unknown providers', () => {
    expect(() =>
      validateEnvironment({
        ...production,
        SMS_PROVIDER: 'unknown',
        SMS_GATEWAY_URL: 'disabled',
      }),
    ).toThrow(/SMS_PROVIDER/);
  });
});
