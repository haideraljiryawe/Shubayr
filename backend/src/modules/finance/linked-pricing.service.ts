import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { conflict, invalid } from '../../common/http/api-error';
import { actorDisplayName, actorSelect } from '../../common/users/actor-name';
import { AuditService } from '../audit/audit.service';
import {
  LinkedPriceApplyDto,
  LinkedPricePreviewDto,
  PricePublishApprovalQueryDto,
  PricePublishDecisionDto,
} from './dto/linked-price.dto';
import { BelowCostService } from '../catalog/below-cost.service';
import { ProductsService } from '../catalog/products.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertDifferentActor } from '../../common/access/separation-of-duties';
import { businessDayEnd, businessDayStart } from './business-date';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class LinkedPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly belowCost: BelowCostService,
    private readonly products?: ProductsService,
    private readonly notifications?: NotificationsService,
  ) {}

  async preview(actorId: string, input: LinkedPricePreviewDto) {
    const currencyCode = input.currency_code.toUpperCase();
    const proposed = new Prisma.Decimal(input.rate).div(input.basis);
    const currency = await this.prisma.currency.findUnique({
      where: { code: currencyCode },
    });
    if (!currency?.enabled || currency.is_base) {
      throw invalid(
        'FOREIGN_CURRENCY_REQUIRED',
        'An enabled foreign currency is required',
      );
    }
    const [state, rounding, base] = await Promise.all([
      this.fingerprint(this.prisma, currencyCode),
      this.rounding(this.prisma),
      this.prisma.currency.findFirst({ where: { is_base: true } }),
    ]);
    if (!base)
      throw conflict(
        'BASE_CURRENCY_NOT_CONFIGURED',
        'No base currency is configured',
      );
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
    const proposedItems = state.variants.map((variant) => {
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
    const breaches = await this.belowCost.breaches(
      this.prisma,
      proposedItems.map((item) => ({
        variant_id: item.variant_id,
        sku: item.sku,
        price: item.new_price,
      })),
    );
    const belowCostIds = new Set(breaches.map((breach) => breach.variant_id));
    const items = proposedItems.map((item) => ({
      ...item,
      requires_below_cost_approval: belowCostIds.has(item.variant_id),
    }));
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

  async listApprovals(
    actorId: string,
    permissions: readonly string[],
    query: PricePublishApprovalQueryDto,
  ) {
    if (query.from && query.to && query.from > query.to) {
      throw invalid('DATE_RANGE_INVALID', 'from must be on or before to');
    }
    const canApprove = permissions.includes('sell_below_cost.approve');
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.PricePublishApprovalWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.proposer_id ? { proposed_by: query.proposer_id } : {}),
      ...(query.sku ? { sku_list: { has: query.sku } } : {}),
      ...(query.from || query.to
        ? {
            created_at: {
              ...(query.from ? { gte: businessDayStart(query.from) } : {}),
              ...(query.to ? { lte: businessDayEnd(query.to) } : {}),
            },
          }
        : {}),
      ...(!canApprove ? { proposed_by: actorId } : {}),
    };
    const include = {
      proposer: { select: actorSelect },
      decider: { select: actorSelect },
    } satisfies Prisma.PricePublishApprovalInclude;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.pricePublishApproval.count({ where }),
      this.prisma.pricePublishApproval.findMany({
        where,
        include,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) =>
        this.approvalResponse(row, permissions.includes('cost.view')),
      ),
    };
  }

  async getApproval(
    actorId: string,
    permissions: readonly string[],
    id: string,
  ) {
    const canApprove = permissions.includes('sell_below_cost.approve');
    const row = await this.prisma.pricePublishApproval.findFirst({
      where: { id, ...(!canApprove ? { proposed_by: actorId } : {}) },
      include: {
        proposer: { select: actorSelect },
        decider: { select: actorSelect },
      },
    });
    if (!row) throw new NotFoundException('Price publish approval not found');
    return this.approvalResponse(row, permissions.includes('cost.view'));
  }

  async decide(
    actorId: string,
    id: string,
    input: PricePublishDecisionDto,
    permissions: readonly string[] = [],
  ) {
    const pending = await this.prisma.pricePublishApproval.findUnique({
      where: { id },
    });
    if (!pending)
      throw new NotFoundException('Price publish approval not found');
    if (pending.status !== 'pending') {
      throw conflict(
        'APPROVAL_ALREADY_DECIDED',
        'Price publish approval is already decided',
      );
    }
    assertDifferentActor(
      actorId,
      pending.proposed_by,
      'The price proposer cannot approve or reject their own request',
      'SELF_APPROVAL_FORBIDDEN',
    );
    if (input.decision === 'approve') {
      if (pending.kind === 'fixed') {
        if (!this.products) {
          throw conflict(
            'FIXED_PRICE_APPROVALS_UNAVAILABLE',
            'Fixed-price approvals are unavailable',
          );
        }
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM price_publish_approvals WHERE id = ${id}::uuid FOR UPDATE`;
          const fresh = await tx.pricePublishApproval.findUnique({
            where: { id },
          });
          if (!fresh || fresh.status !== 'pending') {
            throw conflict(
              'APPROVAL_ALREADY_DECIDED',
              'Price publish approval is already decided',
            );
          }
          const payload = await this.products!.applyApprovedFixedPrice(
            tx,
            fresh,
          );
          await tx.pricePublishApproval.update({
            where: { id },
            data: {
              status: 'approved',
              decided_by: actorId,
              decided_at: new Date(),
              decision_reason: input.reason.trim(),
            },
          });
          await this.audit.record(tx, {
            actorId,
            action: 'prices.fixed.approval_approved',
            entityType: 'price_publish_approval',
            entityId: id,
            before: { status: 'pending', proposed_by: fresh.proposed_by },
            after: {
              status: 'approved',
              product_id: fresh.product_id,
              variants: payload.variants.map(({ variant_id, sku }) => ({
                variant_id,
                sku,
              })),
            },
            reason: input.reason.trim(),
          });
          await this.notifications?.record(
            tx,
            fresh.proposed_by,
            'price_approval_approved',
            'price_publish_approval',
            id,
            'approved',
            'staff',
          );
        });
        await this.products.refreshSearch(pending.product_id!);
      } else {
        if (!pending.preview_id) {
          throw conflict(
            'PRICE_PREVIEW_UNAVAILABLE',
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
      }
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
          throw conflict(
            'APPROVAL_ALREADY_DECIDED',
            'Price publish approval is already decided',
          );
        }
        await this.audit.record(tx, {
          actorId,
          action: `prices.${pending.kind}.approval_rejected`,
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
        await this.notifications?.record(
          tx,
          pending.proposed_by,
          'price_approval_rejected',
          'price_publish_approval',
          id,
          'rejected',
          'staff',
        );
      });
    }
    return this.getApproval(
      actorId,
      [...permissions, 'sell_below_cost.approve'],
      id,
    );
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
          throw conflict(
            'BASE_CURRENCY_NOT_CONFIGURED',
            'No base currency is configured',
          );
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
              kind: 'linked',
              preview_id: preview.id,
              proposed_by: preview.actor_id,
              proposal_reason: proposalReason,
              breaches: belowCostBreaches,
              sku_list: belowCostBreaches.map((breach) => breach.sku),
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
          await this.notifications?.recordStaffWithPermission(
            tx,
            'sell_below_cost.approve',
            'price_approval_requested',
            'price_publish_approval',
            request.id,
            'created',
          );
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
          'SELF_APPROVAL_FORBIDDEN',
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
        await this.notifications?.record(
          tx,
          approval.proposed_by,
          'price_approval_approved',
          'price_publish_approval',
          approval.id,
          'approved',
          'staff',
        );
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

  private approvalResponse(
    row: Prisma.PricePublishApprovalGetPayload<{
      include: {
        proposer: { select: typeof actorSelect };
        decider: { select: typeof actorSelect };
      };
    }>,
    canViewCost: boolean,
  ) {
    const breaches = Array.isArray(row.breaches)
      ? row.breaches.map((entry) => {
          const breach = entry as Prisma.JsonObject;
          if (canViewCost) return breach;
          const {
            cost: _cost,
            minimum_price: _minimumPrice,
            ...publicBreach
          } = breach;
          void _cost;
          void _minimumPrice;
          return publicBreach;
        })
      : [];
    const payload = row.fixed_payload as {
      product_id: string;
      proposed_product_price: number;
      variants: Array<{
        variant_id: string;
        sku: string;
        proposed_selling_price: number | null;
      }>;
    } | null;
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      preview_id: row.preview_id,
      product_id: row.product_id,
      price_version_id: row.price_version_id,
      proposed_by: row.proposed_by,
      proposed_by_name: actorDisplayName(row.proposer),
      proposer: { id: row.proposer.id, name: row.proposer.name },
      decided_by: row.decided_by,
      decided_by_name: row.decider ? actorDisplayName(row.decider) : null,
      decider: row.decider
        ? { id: row.decider.id, name: row.decider.name }
        : null,
      proposal_reason: row.proposal_reason,
      decision_reason: row.decision_reason,
      sku_list: row.sku_list,
      breaches,
      fixed_proposal:
        row.kind === 'fixed' && payload
          ? {
              product_id: payload.product_id,
              proposed_product_price: payload.proposed_product_price,
              variants: payload.variants.map((variant) => ({
                variant_id: variant.variant_id,
                sku: variant.sku,
                proposed_selling_price: variant.proposed_selling_price,
              })),
            }
          : null,
      created_at: row.created_at,
      decided_at: row.decided_at,
    };
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
