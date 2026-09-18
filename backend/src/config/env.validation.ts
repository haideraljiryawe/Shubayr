import Joi from 'joi';

const schema = Joi.object({
  APP_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  API_PORT: Joi.number().port().default(8000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  MEILI_HOST: Joi.string().uri().required(),
  MEILI_MASTER_KEY: Joi.string().min(8).required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('30d'),
  OTP_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),
  DEV_OTP: Joi.string()
    .pattern(/^\d{6}$/)
    .default('000000'),
  SMS_GATEWAY_URL: Joi.string()
    .uri()
    .when('APP_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
  SMS_GATEWAY_TOKEN: Joi.string().when('APP_ENV', {
    is: 'production',
    then: Joi.string().min(8).required(),
    otherwise: Joi.optional().allow(''),
  }),
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
