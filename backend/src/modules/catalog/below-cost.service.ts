import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertDifferentActor } from '../../common/access/separation-of-duties';

type Db = PrismaService | Prisma.TransactionClient | PrismaClient;

export type BelowCostOverride = {
  reason?: string | null;
  originatorId?: string | null;
};

@Injectable()
export class BelowCostService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(
    db: Db,
    actorId: string,
    permissions: readonly string[],
    variants: readonly { variant_id: string; sku: string; price: number }[],
    override: BelowCostOverride = {},
  ) {
    const breaches = await this.breaches(db, variants);
    if (!breaches.length) return [];
    const canApprove = permissions.includes('sell_below_cost.approve');
    if (canApprove && override.reason?.trim() && override.originatorId) {
      assertDifferentActor(
        actorId,
        override.originatorId,
        'The price or order originator cannot approve their own below-cost exception',
      );
      return breaches;
    }
    const canViewCost = permissions.includes('cost.view');
    throw new ForbiddenException({
      status: 403,
      code: 'BELOW_COST_BLOCKED',
      message: canApprove
        ? 'A reason and a different originating actor are required for a below-cost exception'
        : 'The selling price is below the protected threshold',
      errors: breaches.map((breach) => ({
        field: `variant.${breach.variant_id}`,
        code: 'BELOW_COST_BLOCKED',
        message: `${breach.sku} is below the protected price threshold`,
        sku: breach.sku,
        price: breach.price,
        threshold_percent: breach.threshold_percent,
        ...(canViewCost
          ? { cost: breach.cost, minimum_price: breach.minimum_price }
          : {}),
      })),
    });
  }

  async breaches(
    db: Db,
    variants: readonly { variant_id: string; sku: string; price: number }[],
  ) {
    if (!variants.length) return [];
    const [threshold, costs] = await Promise.all([
      db.protectionThreshold.findUnique({ where: { key: 'price' } }),
      db.skuCost.findMany({
        where: { variant_id: { in: variants.map((item) => item.variant_id) } },
      }),
    ]);
    const percent = Number(threshold?.percent ?? 100);
    const byVariant = new Map(costs.map((cost) => [cost.variant_id, cost]));
    return variants.flatMap((variant) => {
      const stored = byVariant.get(variant.variant_id);
      if (!stored) return [];
      const reference = Prisma.Decimal.max(
        stored.average_cost_iqd,
        stored.last_landed_cost_iqd ?? 0,
      );
      const minimum = reference.mul(percent).div(100);
      if (new Prisma.Decimal(variant.price).gte(minimum)) return [];
      return [
        {
          variant_id: variant.variant_id,
          sku: variant.sku,
          price: variant.price,
          cost: Number(reference),
          threshold_percent: percent,
          minimum_price: Number(minimum),
        },
      ];
    });
  }
}
