import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { RATE_LIMIT_TIER, RateLimitRisk } from '../rate-limit/rate-limit-tier';

const limitSetting: Record<RateLimitRisk, string> = {
  [RateLimitRisk.Catalog]: 'RATE_LIMIT_CATALOG_PER_MINUTE',
  [RateLimitRisk.Normal]: 'RATE_LIMIT_NORMAL_PER_MINUTE',
  [RateLimitRisk.Strict]: 'RATE_LIMIT_STRICT_PER_MINUTE',
};

const fallbackLimit: Record<RateLimitRisk, number> = {
  [RateLimitRisk.Catalog]: 600,
  [RateLimitRisk.Normal]: 120,
  [RateLimitRisk.Strict]: 30,
};

@Injectable()
export class TieredThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    super(options, storage, reflector);
  }

  protected override handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const tier =
      this.reflector.getAllAndOverride<RateLimitRisk>(RATE_LIMIT_TIER, [
        props.context.getHandler(),
        props.context.getClass(),
      ]) ?? RateLimitRisk.Normal;
    const limit =
      this.config.get<number>(limitSetting[tier]) ?? fallbackLimit[tier];
    return super.handleRequest({ ...props, limit });
  }
}
