import Joi from 'joi';
import { DEFAULT_CORS_ORIGINS } from './cors';

const schema = Joi.object({
  APP_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  API_PORT: Joi.number().port().default(8000),
  PROCESS_ROLE: Joi.string().valid('api', 'worker', 'all').default('all'),
  WORKER_HEALTH_FILE: Joi.string().default('/tmp/shubayr-worker-ready'),
  RELEASE_VERSION: Joi.string().max(120).default('development'),
  RELEASE_COMMIT: Joi.string().max(64).default('unknown'),
  TRUSTED_PROXIES: Joi.string().allow('').default(''),
  RATE_LIMIT_CATALOG_PER_MINUTE: Joi.number().integer().min(1).default(600),
  RATE_LIMIT_NORMAL_PER_MINUTE: Joi.number().integer().min(1).default(120),
  RATE_LIMIT_STRICT_PER_MINUTE: Joi.number().integer().min(1).default(30),
  LOYALTY_POINTS_PER_CURRENCY_UNIT: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(1),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  NOTIFICATION_PROVIDER: Joi.string()
    .valid('dev', 'disabled', 'fcm')
    .when('APP_ENV', {
      is: 'production',
      then: Joi.valid('disabled', 'fcm').default('disabled'),
      otherwise: Joi.valid('dev', 'disabled', 'fcm').default('dev'),
    }),
  FCM_PROJECT_ID: Joi.string().when('NOTIFICATION_PROVIDER', {
    is: 'fcm',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  FCM_SERVICE_ACCOUNT_JSON_BASE64: Joi.string()
    .min(32)
    .when('NOTIFICATION_PROVIDER', {
      is: 'fcm',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  PUSH_TEST_ACCOUNTS: Joi.string().allow('').default(''),
  PUSH_TEST_OPERATORS: Joi.string().allow('').default(''),
  PUSH_DEVICE_MAX_AGE_DAYS: Joi.number().integer().min(1).max(365).default(45),
  MEILI_HOST: Joi.string().uri().required(),
  MEILI_MASTER_KEY: Joi.string().min(8).required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  ADMIN_REFRESH_ROTATION_GRACE_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(120)
    .default(30),
  OTP_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),
  DEV_OTP: Joi.string()
    .pattern(/^\d{6}$/)
    .default('000000'),
  SMS_GATEWAY_URL: Joi.alternatives()
    .try(Joi.string().uri(), Joi.string().valid('disabled'))
    .when('APP_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  SMS_GATEWAY_TOKEN: Joi.string().when('SMS_GATEWAY_URL', {
    is: 'disabled',
    then: Joi.optional().allow(''),
    otherwise: Joi.when('APP_ENV', {
      is: 'production',
      then: Joi.string().min(8).required(),
      otherwise: Joi.optional().allow(''),
    }),
  }),
  SMS_GATEWAY_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60_000)
    .default(10_000),
  PUBLIC_API_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:8000/api/v1'),
  CORS_ORIGINS: Joi.string().default(DEFAULT_CORS_ORIGINS),
  S3_ENDPOINT: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET: Joi.string().min(3).max(63).default('shubayr-media'),
  S3_ACCESS_KEY: Joi.string().min(3).required(),
  S3_SECRET_KEY: Joi.string().min(8).required(),
  MEDIA_MAX_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(20 * 1024 * 1024)
    .default(8 * 1024 * 1024),
}).unknown(true);

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = schema.validate(config, { abortEarly: false });
  if (result.error) {
    throw new Error(`Environment validation failed: ${result.error.message}`);
  }
  return result.value as Record<string, unknown>;
}
