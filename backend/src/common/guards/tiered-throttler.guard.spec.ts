jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerException } from '@nestjs/throttler';
import { RATE_LIMIT_TIER, RateLimitRisk } from '../rate-limit/rate-limit-tier';
import { TieredThrottlerGuard } from './tiered-throttler.guard';

class TestController {}

const catalogHandler = () => undefined;
const strictHandler = () => undefined;

function contextFor(
  handler: 'catalog' | 'strict',
  ip: string,
  forwardedFor?: string,
) {
  const response = { header: jest.fn() };
  const request = {
    ip,
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  };
  return {
    context: {
      getClass: () => TestController,
      getHandler: () =>
        handler === 'catalog' ? catalogHandler : strictHandler,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext,
    response,
  };
}

function guardWithLimits(limits: Record<string, number>) {
  const hits = new Map<string, number>();
  const increment = jest.fn((key: string, _ttl: number, limit: number) => {
    const totalHits = (hits.get(key) ?? 0) + 1;
    hits.set(key, totalHits);
    return Promise.resolve({
      totalHits,
      timeToExpire: 60,
      isBlocked: totalHits > limit,
      timeToBlockExpire: 60,
    });
  });
  const storage: ThrottlerStorage = {
    increment,
  };
  const config = {
    get: jest.fn((key: string) => limits[key]),
  } as unknown as ConfigService;
  const guard = new TieredThrottlerGuard(
    { throttlers: [{ ttl: 60_000, limit: 120 }] },
    storage,
    new Reflector(),
    config,
  );
  void guard.onModuleInit();
  return { guard, increment };
}

beforeAll(() => {
  Reflect.defineMetadata(
    RATE_LIMIT_TIER,
    RateLimitRisk.Catalog,
    catalogHandler,
  );
  Reflect.defineMetadata(RATE_LIMIT_TIER, RateLimitRisk.Strict, strictHandler);
});

describe('TieredThrottlerGuard', () => {
  it('allows 300 catalog reads from 300 client addresses behind a trusted store proxy', async () => {
    const { guard, increment } = guardWithLimits({
      RATE_LIMIT_CATALOG_PER_MINUTE: 600,
    });

    for (let index = 0; index < 300; index += 1) {
      const { context } = contextFor(
        'catalog',
        `198.51.${Math.floor(index / 250)}.${(index % 250) + 1}`,
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    expect(increment).toHaveBeenCalledTimes(300);
    expect(increment).toHaveBeenLastCalledWith(
      expect.any(String),
      60_000,
      600,
      60_000,
      'default',
    );
  });

  it('refuses one shopper who exceeds the strict OTP-style tier', async () => {
    const { guard } = guardWithLimits({ RATE_LIMIT_STRICT_PER_MINUTE: 2 });
    const shopper = () => contextFor('strict', '198.51.100.20').context;

    await expect(guard.canActivate(shopper())).resolves.toBe(true);
    await expect(guard.canActivate(shopper())).resolves.toBe(true);
    await expect(guard.canActivate(shopper())).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('does not let an untrusted caller split its bucket with spoofed forwarded headers', async () => {
    const { guard } = guardWithLimits({ RATE_LIMIT_STRICT_PER_MINUTE: 2 });
    const untrustedPeer = '203.0.113.40';

    await expect(
      guard.canActivate(
        contextFor('strict', untrustedPeer, '198.51.100.1').context,
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        contextFor('strict', untrustedPeer, '198.51.100.2').context,
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        contextFor('strict', untrustedPeer, '198.51.100.3').context,
      ),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });
});
