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
  PricePublishDecisionDto,
} from './dto/linked-price.dto';
import { BelowCostService } from '../catalog/below-cost.service';
import { assertDifferentActor } from '../../common/access/separation-of-duties';

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
    return this.apply(actorId, input, false);
  }

  publish(actorId: string, input: LinkedPriceApplyDto) {
    return this.apply(actorId, input, true);
  }

  async decide(actorId: string, id: string, input: PricePublishDecisionDto) {
    const pending = await this.prisma.pricePublishApproval.findUnique({
      where: { id },
    });
    if (!pending)
      throw new NotFoundException('Price publish approval not found');
    if (pending.status !== 'pending') {
      throw new ConflictException('Price publish approval is already decided');
    }
    assertDifferentActor(
      actorId,
      pending.proposed_by,
      'The price proposer cannot approve or reject their own request',
    );
    if (input.decision === 'approve') {
      if (!pending.preview_id) {
        throw new ConflictException(
          'Price publish preview is no longer available',
        );
      }
      await this.apply(
        actorId,
        { preview_token: pending.preview_id },
        true,
        pending.id,
        input.reason,
      );
    } else {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.pricePublishApproval.updateMany({
          where: { id, status: 'pending' },
          data: {
            status: 'rejected',
            decided_by: actorId,
            decided_at: new Date(),
            decision_reason: input.reason.trim(),
          },
        });
        if (!updated.count) {
          throw new ConflictException(
            'Price publish approval is already decided',
          );
        }
        await this.audit.record(tx, {
          actorId,
          action: 'prices.linked.approval_rejected',
          entityType: 'price_publish_approval',
          entityId: id,
          before: { status: 'pending', proposed_by: pending.proposed_by },
          after: { status: 'rejected' },
          reason: input.reason.trim(),
        });
        if (pending.preview_id) {
          await tx.linkedPricePreview.delete({
            where: { id: pending.preview_id },
          });
        }
      });
    }
    return this.prisma.pricePublishApproval.findUniqueOrThrow({
      where: { id },
    });
  }

  private async apply(
    actorId: string,
    input: LinkedPriceApplyDto,
    publish: boolean,
    approvalRequestId?: string,
    decisionReason?: string,
  ) {
    const token = input.preview_token;
    return this.prisma.$transaction(async (tx) => {
      const preview = await tx.linkedPricePreview.findUnique({
        where: { id: token },
      });
      const approval = approvalRequestId
        ? await tx.pricePublishApproval.findUnique({
            where: { id: approvalRequestId },
          })
        : null;
      if (
        !preview ||
        (!approvalRequestId && preview.actor_id !== actorId) ||
        (approvalRequestId &&
          (!approval ||
            approval.status !== 'pending' ||
            approval.preview_id !== preview.id))
      ) {
        throw new NotFoundException('Linked-price preview not found');
      }
      if (!approvalRequestId && preview.expires_at <= new Date()) {
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
      let rounding: Prisma.Decimal | null = null;
      let nextPrices: Array<{
        variant_id: string;
        sku: string;
        price: number;
      }> = [];
      let belowCostBreaches: Awaited<ReturnType<BelowCostService['breaches']>> =
        [];
      if (publish) {
        const [configuredRounding, base] = await Promise.all([
          this.rounding(tx),
          tx.currency.findFirst({ where: { is_base: true } }),
        ]);
        if (!base)
          throw new ConflictException('No base currency is configured');
        rounding = configuredRounding;
        nextPrices = state.variants.map((variant) => ({
          variant_id: variant.id,
          sku: variant.sku,
          price: this.round(
            variant.reference_price!.mul(preview.proposed_rate),
            configuredRounding,
            base.display_precision,
          ),
        }));
        belowCostBreaches = await this.belowCost.breaches(tx, nextPrices);
        if (belowCostBreaches.length && !approvalRequestId) {
          const proposalReason =
            input.below_cost_override_reason?.trim() || preview.reason.trim();
          const request = await tx.pricePublishApproval.create({
            data: {
              preview_id: preview.id,
              proposed_by: preview.actor_id,
              proposal_reason: proposalReason,
              breaches: belowCostBreaches,
            },
          });
          await this.audit.record(tx, {
            actorId: preview.actor_id,
            action: 'prices.linked.approval_requested',
            entityType: 'price_publish_approval',
            entityId: request.id,
            after: {
              status: 'pending',
              currency_code: preview.currency_code,
              variants: belowCostBreaches,
            },
            reason: request.proposal_reason,
          });
          return {
            mode: 'pending_approval' as const,
            exchange_rate_id: null,
            price_version_id: null,
            approval_request_id: request.id,
            linked_sku_count: state.variants.length,
          };
        }
      }
      if (approval) {
        assertDifferentActor(
          actorId,
          approval.proposed_by,
          'The price proposer cannot approve their own request',
        );
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
      if (!publish) {
        await tx.productVariant.updateMany({
          where: {
            pricing_mode: 'linked',
            reference_currency_code: preview.currency_code,
          },
          data: { awaiting_rate_id: rate.id, updated_at: new Date() },
        });
      } else {
        priceVersion = await tx.priceVersion.create({
          data: {
            exchange_rate_id: rate.id,
            currency_code: preview.currency_code,
            rate: rate.rate,
            rounding_multiple: rounding!,
            published_by: actorId,
            proposed_by: preview.actor_id,
            variant_count: state.variants.length,
          },
        });
        for (const variant of state.variants) {
          const proposed = nextPrices.find(
            (item) => item.variant_id === variant.id,
          )!;
          await tx.productVariant.update({
            where: { id: variant.id },
            data: {
              published_price: proposed.price,
              price_version_id: priceVersion.id,
              awaiting_rate_id: null,
              price_approved_at: new Date(),
              price_proposed_by: preview.actor_id,
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
      if (approval && priceVersion) {
        await tx.pricePublishApproval.update({
          where: { id: approval.id },
          data: {
            status: 'approved',
            decided_by: actorId,
            decided_at: new Date(),
            decision_reason: decisionReason?.trim() ?? null,
            price_version_id: priceVersion.id,
            preview_id: null,
          },
        });
        await this.audit.record(tx, {
          actorId,
          action: 'prices.linked.approval_approved',
          entityType: 'price_publish_approval',
          entityId: approval.id,
          before: { status: 'pending', proposed_by: approval.proposed_by },
          after: {
            status: 'approved',
            price_version_id: priceVersion.id,
            variants: belowCostBreaches,
          },
          reason: decisionReason,
        });
      }
      await tx.linkedPricePreview.delete({ where: { id: preview.id } });
      return {
        mode: publish ? 'published' : 'rate_only',
        exchange_rate_id: rate.id,
        price_version_id: priceVersion?.id ?? null,
        approval_request_id: approval?.id ?? null,
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
