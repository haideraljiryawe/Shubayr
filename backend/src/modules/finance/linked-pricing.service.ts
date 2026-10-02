import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  LinkedPriceApplyDto,
  LinkedPricePreviewDto,
} from './dto/linked-price.dto';
import { BelowCostService } from '../catalog/below-cost.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class LinkedPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly belowCost: BelowCostService,
  ) {}

  async preview(actorId: string, input: LinkedPricePreviewDto) {
    const currencyCode = input.currency_code.toUpperCase();
    const proposed = new Prisma.Decimal(input.rate).div(input.basis);
    const currency = await this.prisma.currency.findUnique({
      where: { code: currencyCode },
    });
    if (!currency?.enabled || currency.is_base) {
      throw new UnprocessableEntityException(
        'An enabled foreign currency is required',
      );
    }
    const [state, rounding, base] = await Promise.all([
      this.fingerprint(this.prisma, currencyCode),
      this.rounding(this.prisma),
      this.prisma.currency.findFirst({ where: { is_base: true } }),
    ]);
    if (!base) throw new ConflictException('No base currency is configured');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const record = await this.prisma.linkedPricePreview.create({
      data: {
        actor_id: actorId,
        currency_code: currencyCode,
        proposed_rate: proposed,
        effective_at: new Date(input.effective_at),
        reason: input.reason.trim(),
        fingerprint: state.hash,
        expires_at: expiresAt,
      },
    });
    const items = state.variants.map((variant) => {
      const oldPrice =
        variant.published_price === null
          ? null
          : Number(variant.published_price);
      const newPrice = this.round(
        variant.reference_price!.mul(proposed),
        rounding,
        base.display_precision,
      );
      return {
        variant_id: variant.id,
        sku: variant.sku,
        old_price: oldPrice,
        new_price: newPrice,
        percent_change:
          oldPrice && oldPrice !== 0
            ? Number((((newPrice - oldPrice) / oldPrice) * 100).toFixed(2))
            : null,
      };
    });
    return {
      preview_token: record.id,
      expires_at: expiresAt,
      currency_code: currencyCode,
      old_rate: state.latestRate ? Number(state.latestRate.rate) : null,
      new_rate: Number(proposed),
      linked_sku_count: items.length,
      rounding_multiple: Number(rounding),
      items,
    };
  }

  applyRateOnly(actorId: string, input: LinkedPriceApplyDto) {
    return this.apply(actorId, input, false, []);
  }

  publish(actorId: string, input: LinkedPriceApplyDto, permissions: string[]) {
    return this.apply(actorId, input, true, permissions);
  }

  private async apply(
    actorId: string,
    input: LinkedPriceApplyDto,
    publish: boolean,
    permissions: string[],
  ) {
    const token = input.preview_token;
    return this.prisma.$transaction(async (tx) => {
      const preview = await tx.linkedPricePreview.findUnique({
        where: { id: token },
      });
      if (!preview || preview.actor_id !== actorId) {
        throw new NotFoundException('Linked-price preview not found');
      }
      if (preview.expires_at <= new Date()) {
        throw new ConflictException({
          status: 409,
          code: 'STALE_PRICE_PREVIEW',
          message: 'The linked-price preview has expired',
          errors: [],
        });
      }
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`linked-price:${preview.currency_code}`}))::text AS locked`;
      const state = await this.fingerprint(tx, preview.currency_code);
      if (state.hash !== preview.fingerprint) {
        throw new ConflictException({
          status: 409,
          code: 'STALE_PRICE_PREVIEW',
          message: 'Rates or linked SKUs changed; refresh the preview',
          errors: [],
        });
      }
      const rate = await tx.exchangeRate.create({
        data: {
          currency_code: preview.currency_code,
          rate: preview.proposed_rate,
          effective_at: preview.effective_at,
          set_by: actorId,
          reason: preview.reason,
        },
      });
      let priceVersion = null;
      let belowCostBreaches: Awaited<
        ReturnType<BelowCostService['assertAllowed']>
      > = [];
      if (!publish) {
        await tx.productVariant.updateMany({
          where: {
            pricing_mode: 'linked',
            reference_currency_code: preview.currency_code,
          },
          data: { awaiting_rate_id: rate.id, updated_at: new Date() },
        });
      } else {
        const [rounding, base] = await Promise.all([
          this.rounding(tx),
          tx.currency.findFirst({ where: { is_base: true } }),
        ]);
        if (!base)
          throw new ConflictException('No base currency is configured');
        const nextPrices = state.variants.map((variant) => ({
          variant_id: variant.id,
          sku: variant.sku,
          price: this.round(
            variant.reference_price!.mul(rate.rate),
            rounding,
            base.display_precision,
          ),
        }));
        belowCostBreaches = await this.belowCost.assertAllowed(
          tx,
          actorId,
          permissions,
          nextPrices,
          {
            reason: input.below_cost_override_reason,
            originatorId: input.below_cost_originator_id,
          },
        );
        priceVersion = await tx.priceVersion.create({
          data: {
            exchange_rate_id: rate.id,
            currency_code: preview.currency_code,
            rate: rate.rate,
            rounding_multiple: rounding,
            published_by: actorId,
            variant_count: state.variants.length,
          },
        });
        for (const variant of state.variants) {
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              published_price: this.round(
                variant.reference_price!.mul(rate.rate),
                rounding,
                base.display_precision,
              ),
              price_version_id: priceVersion.id,
              awaiting_rate_id: null,
              price_approved_at: new Date(),
              updated_at: new Date(),
            },
          });
        }
      }
      await this.audit.record(tx, {
        actorId,
        action: publish ? 'prices.linked.publish' : 'exchange_rate.save_only',
        entityType: publish ? 'price_version' : 'exchange_rate',
        entityId: priceVersion?.id ?? rate.id,
        after: {
          currency_code: preview.currency_code,
          rate: rate.rate.toString(),
          linked_sku_count: state.variants.length,
        },
        reason: preview.reason,
      });
      if (belowCostBreaches.length && priceVersion) {
        await this.audit.record(tx, {
          actorId,
          action: 'prices.below_cost.override',
          entityType: 'price_version',
          entityId: priceVersion.id,
          after: { variants: belowCostBreaches },
          reason: input.below_cost_override_reason ?? undefined,
        });
      }
      await tx.linkedPricePreview.delete({ where: { id: preview.id } });
      return {
        mode: publish ? 'published' : 'rate_only',
        exchange_rate_id: rate.id,
        price_version_id: priceVersion?.id ?? null,
        linked_sku_count: state.variants.length,
      };
    });
  }

  private async fingerprint(db: Db, currencyCode: string) {
    const [variants, latestRate, rounding] = await Promise.all([
      db.productVariant.findMany({
        where: {
          pricing_mode: 'linked',
          reference_currency_code: currencyCode,
        },
        select: {
          id: true,
          sku: true,
          reference_price: true,
          published_price: true,
          updated_at: true,
        },
        orderBy: { id: 'asc' },
      }),
      db.exchangeRate.findFirst({
        where: { currency_code: currencyCode },
        orderBy: [{ effective_at: 'desc' }, { id: 'desc' }],
        select: { id: true, rate: true },
      }),
      this.rounding(db),
    ]);
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          latest_rate_id: latestRate?.id ?? null,
          rounding: rounding.toString(),
          variants: variants.map((variant) => ({
            id: variant.id,
            reference_price: variant.reference_price?.toString() ?? null,
            published_price: variant.published_price?.toString() ?? null,
            updated_at: variant.updated_at.toISOString(),
          })),
        }),
      )
      .digest('hex');
    return { hash, variants, latestRate };
  }

  private async rounding(db: Db) {
    const setting = await db.storeSetting.findUnique({
      where: { key: 'sale_rounding_multiple' },
    });
    const value = new Prisma.Decimal(setting?.value || 0);
    return value.gte(0) ? value : new Prisma.Decimal(0);
  }

  private round(
    value: Prisma.Decimal,
    multiple: Prisma.Decimal,
    precision: number,
  ) {
    return Number(
      multiple.gt(0)
        ? value.div(multiple).ceil().mul(multiple)
        : value.toDecimalPlaces(precision, Prisma.Decimal.ROUND_HALF_UP),
    );
  }
}
