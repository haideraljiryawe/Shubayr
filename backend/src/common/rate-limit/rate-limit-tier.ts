import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_TIER = 'shubayr:rate-limit-tier';

export enum RateLimitRisk {
  Catalog = 'catalog',
  Normal = 'normal',
  Strict = 'strict',
}

export const RateLimitTier = (tier: RateLimitRisk) =>
  SetMetadata(RATE_LIMIT_TIER, tier);
