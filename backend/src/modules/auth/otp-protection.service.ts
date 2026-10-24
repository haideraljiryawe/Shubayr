import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import Redis from 'ioredis';

const RESERVE_OTP_LUA = `
local cooldown_ttl = redis.call('PTTL', KEYS[1])
if cooldown_ttl > 0 then return {1, cooldown_ttl} end

local now = tonumber(ARGV[1])
local token = ARGV[2]
local phone_window_ms = tonumber(ARGV[3])
local phone_window_max = tonumber(ARGV[4])
local phone_daily_ms = tonumber(ARGV[5])
local phone_daily_max = tonumber(ARGV[6])
local ip_window_ms = tonumber(ARGV[7])
local ip_window_max = tonumber(ARGV[8])
local cooldown_ms = tonumber(ARGV[9])
local lock_ms = tonumber(ARGV[10])

redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - phone_window_ms)
local phone_window_count = redis.call('ZCARD', KEYS[2])
if phone_window_count >= phone_window_max then
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  return {2, math.max(1, phone_window_ms - (now - tonumber(oldest[2])))}
end

redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now - phone_daily_ms)
local phone_daily_count = redis.call('ZCARD', KEYS[3])
if phone_daily_count >= phone_daily_max then
  local oldest = redis.call('ZRANGE', KEYS[3], 0, 0, 'WITHSCORES')
  return {2, math.max(1, phone_daily_ms - (now - tonumber(oldest[2])))}
end

if KEYS[4] ~= '' then
  redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now - ip_window_ms)
  local ip_count = redis.call('ZCARD', KEYS[4])
  if ip_count >= ip_window_max then
    local oldest = redis.call('ZRANGE', KEYS[4], 0, 0, 'WITHSCORES')
    return {3, math.max(1, ip_window_ms - (now - tonumber(oldest[2])))}
  end
end

local locked = redis.call('SET', KEYS[5], token, 'PX', lock_ms, 'NX')
if not locked then return {1, math.max(1, redis.call('PTTL', KEYS[5]))} end

redis.call('SET', KEYS[1], token, 'PX', cooldown_ms)
redis.call('ZADD', KEYS[2], now, token)
redis.call('PEXPIRE', KEYS[2], phone_window_ms)
redis.call('ZADD', KEYS[3], now, token)
redis.call('PEXPIRE', KEYS[3], phone_daily_ms)
if KEYS[4] ~= '' then
  redis.call('ZADD', KEYS[4], now, token)
  redis.call('PEXPIRE', KEYS[4], ip_window_ms)
end
return {0, cooldown_ms}
`;

const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export type OtpReservation = {
  resendAfterSeconds: number;
  release: () => Promise<void>;
};

@Injectable()
export class OtpProtectionService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    const database = new URL(config.getOrThrow<string>('DATABASE_URL'))
      .pathname;
    this.prefix = `shubayr:otp:${createHash('sha256').update(database).digest('hex').slice(0, 16)}`;
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  async reserve(phone: string, requesterIp?: string): Promise<OtpReservation> {
    const token = randomUUID();
    const phoneKey = this.digest(phone);
    const ipKey =
      requesterIp && isIP(requesterIp) ? this.digest(requesterIp) : '';
    const cooldownSeconds = this.config.get<number>(
      'OTP_RESEND_COOLDOWN_SECONDS',
      60,
    );
    const phoneWindowSeconds = this.config.get<number>(
      'OTP_PHONE_WINDOW_SECONDS',
      600,
    );
    const providerTimeout = Math.max(
      this.config.get<number>('OTPIQ_TIMEOUT_MS', 10_000),
      this.config.get<number>('SMS_GATEWAY_TIMEOUT_MS', 10_000),
    );
    const keys = [
      `${this.prefix}:cooldown:${phoneKey}`,
      `${this.prefix}:phone-window:${phoneKey}`,
      `${this.prefix}:phone-daily:${phoneKey}`,
      ipKey ? `${this.prefix}:ip-hour:${ipKey}` : '',
      `${this.prefix}:lock:${phoneKey}`,
    ];
    let result: unknown;
    try {
      result = await this.redis.eval(
        RESERVE_OTP_LUA,
        keys.length,
        ...keys,
        Date.now(),
        token,
        phoneWindowSeconds * 1000,
        this.config.get<number>('OTP_PHONE_WINDOW_MAX', 3),
        86_400_000,
        this.config.get<number>('OTP_PHONE_DAILY_MAX', 10),
        3_600_000,
        this.config.get<number>('OTP_IP_HOURLY_MAX', 60),
        cooldownSeconds * 1000,
        Math.max(cooldownSeconds * 1000, providerTimeout) + 5_000,
      );
    } catch {
      throw new ServiceUnavailableException({
        status: 503,
        code: 'OTP_DELIVERY_UNAVAILABLE',
        message: 'OTP delivery is unavailable',
        message_ar: 'خدمة إرسال رمز التحقق غير متاحة حالياً',
        message_en: 'OTP delivery is unavailable',
        errors: [],
      });
    }
    if (!Array.isArray(result) || result.length < 2) {
      throw new ServiceUnavailableException({
        status: 503,
        code: 'OTP_DELIVERY_UNAVAILABLE',
        message: 'OTP delivery is unavailable',
        message_ar: 'خدمة إرسال رمز التحقق غير متاحة حالياً',
        message_en: 'OTP delivery is unavailable',
        errors: [],
      });
    }
    const outcome = Number(result[0]);
    const retryAfterSeconds = Math.max(1, Math.ceil(Number(result[1]) / 1000));
    if (outcome !== 0) {
      const values =
        outcome === 2
          ? {
              code: 'OTP_PHONE_QUOTA_EXCEEDED',
              en: 'Too many verification codes were requested for this phone',
              ar: 'تم طلب رموز تحقق كثيرة لهذا الرقم',
            }
          : outcome === 3
            ? {
                code: 'OTP_IP_QUOTA_EXCEEDED',
                en: 'Too many verification codes were requested from this network',
                ar: 'تم طلب رموز تحقق كثيرة من هذه الشبكة',
              }
            : {
                code: 'OTP_RESEND_TOO_SOON',
                en: 'Wait before requesting another verification code',
                ar: 'يرجى الانتظار قبل طلب رمز تحقق جديد',
              };
      throw new HttpException(
        {
          status: 429,
          code: values.code,
          message: values.en,
          message_ar: values.ar,
          message_en: values.en,
          errors: [],
          retry_after_seconds: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return {
      resendAfterSeconds: cooldownSeconds,
      release: async () => {
        try {
          await this.redis.eval(RELEASE_LOCK_LUA, 1, keys[4], token);
        } catch {
          // The expiring lock is only an extra serialization guard. The
          // already-reserved cooldown remains authoritative if release fails.
        }
      },
    };
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
