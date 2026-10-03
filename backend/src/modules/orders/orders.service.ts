import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from '../catalog/products.service';
import { AuditService } from '../audit/audit.service';
import { assertDifferentActor } from '../../common/access/separation-of-duties';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  businessDate,
  businessDateText,
  businessDayEnd,
  businessDayStart,
} from '../finance/business-date';
import { calculateLineTotal } from '../catalog/pricing';
import {
  activeCoupon,
  calculateCartTotals,
  skuUnitPrice,
  skuPriceVersion,
  MAX_CART_ITEM_QUANTITY,
} from './cart-pricing';
import { addBusinessMinutes } from './business-time';
import { assertOrderTransition, staleOrder } from './order-transition';
import { BelowCostService } from '../catalog/below-cost.service';
import {
  OrderQueryDto,
  OrderStatus,
  AdminOrderQueryDto,
  CancelOrderDto,
  CustomerCancelDto,
  CancellationRequestDto,
  ResolveCancellationRequestDto,
  ResolveShortageDto,
  ShortageResponseDto,
  RejectOrderDto,
  PlaceOrderDto,
  UpdateOrderStatusDto,
  MonitorOrderQueryDto,
  ORDER_STATUSES,
} from './dto/order.dto';

const orderInclude = {
  items: true,
  status_events: { orderBy: [{ at: 'asc' as const }, { id: 'asc' as const }] },
  retrievals: {
    select: { id: true, document_number: true, status: true, outcome: true },
    orderBy: { created_at: 'desc' as const },
  },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
const adminOrderInclude = {
  items: { orderBy: { id: 'asc' as const } },
  payments: { orderBy: { id: 'asc' as const } },
  user: { select: { id: true, name: true, phone: true, email: true } },
  delivery: {
    include: {
      agent: { select: { id: true, name: true, phone: true, email: true } },
    },
  },
  status_events: { orderBy: [{ at: 'asc' as const }, { id: 'asc' as const }] },
  retrievals: {
    include: { lines: { orderBy: { id: 'asc' as const } } },
    orderBy: { created_at: 'desc' as const },
  },
} satisfies Prisma.OrderInclude;
type AdminOrderRow = Prisma.OrderGetPayload<{
  include: typeof adminOrderInclude;
}>;
const cancellableStatuses = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_dispatch',
] as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
    private readonly notifications?: NotificationsService,
    private readonly inventory: InventoryService = undefined as unknown as InventoryService,
    private readonly belowCost: BelowCostService = undefined as unknown as BelowCostService,
  ) {}

  async place(userId: string, input: PlaceOrderDto, rawKey?: string) {
    const key = rawKey?.trim();
    if (
      rawKey !== undefined &&
      (!key || key.length > 128 || !/^[\x21-\x7e]+$/.test(key))
    ) {
      throw new UnprocessableEntityException(
        'Idempotency-Key must be 1-128 printable ASCII characters',
      );
    }
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          address_id: input.address_id,
          coupon_code: input.coupon_code?.trim().toUpperCase() ?? null,
          payment_method: input.payment_method ?? 'cod',
          accepted_price_versions: [
            ...(input.accepted_price_versions ?? []),
          ].sort((left, right) =>
            left.variant_id.localeCompare(right.variant_id),
          ),
        }),
      )
      .digest('hex');

    const orderId = await this.prisma.$transaction(async (tx) => {
      // Serialize this user's checkouts and idempotent retries, including cart clearing.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (key) {
        const prior = await tx.order.findUnique({
          where: {
            user_id_idempotency_key: { user_id: userId, idempotency_key: key },
          },
        });
        if (prior) {
          if (prior.idempotency_fingerprint !== fingerprint) {
            throw new ConflictException(
              'Idempotency-Key was used with a different checkout request',
            );
          }
          return prior.id;
        }
      }
      const address = await tx.address.findFirst({
        where: { id: input.address_id, user_id: userId },
      });
      if (!address) throw new NotFoundException('Address not found');
      const cart = await tx.cart.findUnique({
        where: { user_id: userId },
        include: { items: true, coupon: true },
      });
      if (!cart?.items.length) throw new ConflictException('Cart is empty');
      // Product locks serialize competing checkouts before reading sellable stock.
      const productIds = [
        ...new Set(cart.items.map((item) => item.product_id)),
      ].sort();
      for (const productId of productIds) {
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      }
      const at = new Date();
      const documentDate = businessDate(at);
      const lines = [];
      const acceptedVersions = new Map(
        (input.accepted_price_versions ?? []).map((entry) => [
          entry.variant_id,
          entry.price_version,
        ]),
      );
      if (
        acceptedVersions.size !== (input.accepted_price_versions ?? []).length
      ) {
        throw new UnprocessableEntityException(
          'accepted_price_versions must not repeat a variant',
        );
      }
      const priceChanges: Array<{
        product_id: string;
        variant_id: string;
        sku: string;
        old_price: number;
        new_price: number;
        old_price_version: string;
        new_price_version: string;
      }> = [];
      for (const item of cart.items) {
        const requestedQuantity = Number(item.quantity);
        if (
          requestedQuantity <= 0 ||
          requestedQuantity > MAX_CART_ITEM_QUANTITY
        ) {
          throw new ConflictException('Cart quantity is invalid');
        }
        let visible;
        try {
          visible = await this.products.getPublic(item.product_id);
        } catch (error) {
          if (error instanceof NotFoundException)
            throw new ConflictException('A cart product is unavailable');
          throw error;
        }
        const product = await tx.product.findUnique({
          where: { id: item.product_id },
          include: {
            images: { orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] },
            variants: true,
          },
        });
        if (!product || !visible)
          throw new ConflictException('A cart product is unavailable');
        const variant = item.variant_id
          ? product.variants.find((entry) => entry.id === item.variant_id)
          : null;
        if (item.variant_id && !variant)
          throw new ConflictException('A cart variant is unavailable');
        if (!variant) throw new ConflictException('A cart SKU is unavailable');
        if (variant.whole_units_only && !Number.isInteger(requestedQuantity)) {
          throw new ConflictException(
            'This SKU accepts whole-unit quantities only',
          );
        }
        const unit_price = skuUnitPrice(product, variant, at);
        const priceVersion = skuPriceVersion(product, variant, unit_price);
        const oldPrice = Number(item.unit_price);
        const changed =
          oldPrice !== unit_price || item.price_version !== priceVersion;
        if (changed && acceptedVersions.get(variant.id) !== priceVersion) {
          priceChanges.push({
            product_id: product.id,
            variant_id: variant.id,
            sku: variant.sku,
            old_price: oldPrice,
            new_price: unit_price,
            old_price_version: item.price_version,
            new_price_version: priceVersion,
          });
        }
        lines.push({
          product_id: product.id,
          variant_id: item.variant_id,
          quantity: requestedQuantity,
          unit_price,
          line_total: calculateLineTotal(unit_price, requestedQuantity),
          price_version: priceVersion,
          product_name_ar: product.name_ar,
          product_name_en: product.name_en,
          image_url: product.images[0]?.url ?? null,
        });
      }
      if (priceChanges.length) {
        throw new ConflictException({
          status: 409,
          code: 'PRICE_CHANGED',
          message: 'One or more prices changed and require acceptance',
          errors: priceChanges.map((change) => ({
            field: `variant.${change.variant_id}`,
            code: 'PRICE_CHANGED',
            message: `The price for ${change.sku} changed`,
            ...change,
          })),
        });
      }
      // The coupon is rechecked at placement, under lock, never trusted from the client.
      const code =
        input.coupon_code === undefined ? cart.coupon?.code : input.coupon_code;
      const coupon = code
        ? await tx.coupon.findFirst({
            where: { code: { equals: code.trim(), mode: 'insensitive' } },
          })
        : null;
      if (code && (!coupon || !activeCoupon(coupon, at)))
        throw new ConflictException('Coupon is no longer valid');
      if (coupon) {
        await tx.$queryRaw`SELECT id FROM coupons WHERE id = ${coupon.id}::uuid FOR UPDATE`;
        const fresh = await tx.coupon.findUnique({ where: { id: coupon.id } });
        if (!activeCoupon(fresh, at))
          throw new ConflictException('Coupon is no longer valid');
      }
      const totals = calculateCartTotals(lines, coupon, at);
      const deadlines = await this.acceptanceDeadlines(tx, at);
      const order = await tx.order.create({
        data: {
          user_id: userId,
          address_id: address.id,
          coupon_id: coupon?.id ?? null,
          idempotency_key: key ?? null,
          idempotency_fingerprint: key ? fingerprint : null,
          order_number: `ORD-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`,
          payment_method: 'cod',
          status: 'pending',
          acceptance_deadline: deadlines.acceptance,
          auto_cancel_deadline: deadlines.autoCancel,
          price_change_info:
            (input.accepted_price_versions?.length ?? 0) > 0
              ? {
                  accepted_at: at.toISOString(),
                  lines: lines.map((line) => ({
                    variant_id: line.variant_id,
                    unit_price: line.unit_price,
                    price_version: line.price_version,
                  })),
                }
              : undefined,
          document_date: documentDate,
          accounting_date: documentDate,
          ...totals,
          delivery_contact_phone: address.contact_phone,
          delivery_address_label: address.label,
          delivery_city: address.city,
          delivery_area: address.area,
          delivery_street: address.street,
          delivery_details: address.details,
          delivery_lat: address.lat,
          delivery_lng: address.lng,
          items: { create: lines },
          payments: {
            create: {
              method: 'cod',
              status: 'pending',
              amount: totals.total,
              document_date: documentDate,
              accounting_date: documentDate,
            },
          },
          status_events: { create: { status: 'pending', at } },
        },
        include: { items: true },
      });
      const delivery = await tx.delivery.create({
        data: {
          order_id: order.id,
          status: 'assigned',
          delivery_fee: totals.delivery_fee,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { delivery_id: delivery.id },
      });
      await this.inventory.allocateOrder(tx, order.id, userId);
      if (coupon)
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { used_count: { increment: 1 } },
        });
      await tx.cartItem.deleteMany({ where: { cart_id: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: { coupon_id: null, updated_at: at },
      });
      await this.notifications?.record(
        tx,
        userId,
        'order_placed',
        'order',
        order.id,
      );
      await this.notifications?.recordOrderMonitors(tx, 'new_order', order.id);
      return order.id;
    });
    return this.getOwned(userId, orderId);
  }

  private async acceptanceDeadlines(
    tx: Prisma.TransactionClient,
    placedAt: Date,
  ) {
    const [settings, hours, closedDays] = await Promise.all([
      tx.storeSetting.findMany({
        where: {
          key: {
            in: [
              'timezone',
              'acceptance_alert_timeout_minutes',
              'auto_cancel_enabled',
              'auto_cancel_timeout_minutes',
            ],
          },
        },
      }),
      tx.businessHour.findMany({ orderBy: { weekday: 'asc' } }),
      tx.closedDay.findMany({ select: { date: true } }),
    ]);
    const values = Object.fromEntries(
      settings.map((row) => [row.key, row.value]),
    );
    const timeZone = values.timezone || 'Asia/Baghdad';
    const closed = new Set(closedDays.map((row) => businessDateText(row.date)));
    const acceptanceMinutes = Number(
      values.acceptance_alert_timeout_minutes || 15,
    );
    const acceptance = addBusinessMinutes(
      placedAt,
      acceptanceMinutes,
      hours,
      closed,
      timeZone,
    );
    const autoCancelMinutes = Number(values.auto_cancel_timeout_minutes || 0);
    return {
      acceptance,
      autoCancel:
        values.auto_cancel_enabled === 'true' && autoCancelMinutes > 0
          ? addBusinessMinutes(
              placedAt,
              autoCancelMinutes,
              hours,
              closed,
              timeZone,
            )
          : null,
    };
  }

  async list(userId: string, query: OrderQueryDto) {
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    const where = {
      user_id: userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ placed_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * per_page,
        take: per_page,
      }),
    ]);
    return {
      page,
      per_page,
      total,
      data: rows.map((row) => this.toResponse(row)),
    };
  }

  async getOwned(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.user_id !== userId)
      throw new ForbiddenException('Order belongs to another customer');
    return this.toResponse(order);
  }

  async listAdmin(query: AdminOrderQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    if (query.from && query.to && query.from > query.to) {
      throw new UnprocessableEntityException('from must be on or before to');
    }
    const placedAt: Prisma.DateTimeFilter | undefined =
      query.from || query.to
        ? {
            ...(query.from ? { gte: businessDayStart(query.from) } : {}),
            ...(query.to
              ? {
                  lt: new Date(businessDayEnd(query.to).getTime() + 1),
                }
              : {}),
          }
        : undefined;
    const baseWhere: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.customer_id ? { user_id: query.customer_id } : {}),
      ...(query.q
        ? {
            order_number: {
              contains: query.q,
              mode: 'insensitive' as const,
            },
          }
        : {}),
      ...(placedAt ? { placed_at: placedAt } : {}),
    };
    const where: Prisma.OrderWhereInput = {
      ...baseWhere,
      ...(query.late === undefined
        ? {}
        : { late_for_acceptance: query.late }),
      ...(query.needs_attention === undefined
        ? {}
        : { inventory_attention_required: query.needs_attention }),
      ...(query.cancellation_request
        ? { cancellation_request_status: query.cancellation_request }
        : {}),
    };
    const [total, rows, late, needsAttention, pendingCancellation] =
      await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: adminOrderInclude,
        orderBy: [{ placed_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.order.count({
        where: { ...baseWhere, late_for_acceptance: true },
      }),
      this.prisma.order.count({
        where: { ...baseWhere, inventory_attention_required: true },
      }),
      this.prisma.order.count({
        where: { ...baseWhere, cancellation_request_status: 'pending' },
      }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      badge_counts: {
        late,
        needs_attention: needsAttention,
        pending_cancellation: pendingCancellation,
      },
      data: rows.map((row) => this.toAdminResponse(row)),
    };
  }

  async getAdmin(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: adminOrderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.toAdminResponse(order);
  }

  async listMonitor(query: MonitorOrderQueryDto) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    if (query.date_from && query.date_to && query.date_from > query.date_to) {
      throw new UnprocessableEntityException(
        'date_from must be on or before date_to',
      );
    }
    const normalized = query.q ? this.normalizeArabic(query.q) : undefined;
    const search = normalized
      ? Prisma.sql`AND (lower(o.order_number) LIKE ${`%${normalized.toLowerCase()}%`} OR translate(lower(coalesce(u.name, '')), 'أإآٱىةؤئء', 'اااايهوي') LIKE ${`%${normalized}%`})`
      : Prisma.empty;
    const from = query.date_from
      ? Prisma.sql`AND o.placed_at >= (${query.date_from}::date::timestamp AT TIME ZONE 'Asia/Baghdad')`
      : Prisma.empty;
    const to = query.date_to
      ? Prisma.sql`AND o.placed_at < (((${query.date_to}::date + 1)::timestamp) AT TIME ZONE 'Asia/Baghdad')`
      : Prisma.empty;
    const status =
      query.status && query.status !== 'all'
        ? Prisma.sql`AND o.status = ${query.status}`
        : Prisma.empty;
    type MonitorListRow = {
      id: string;
      order_number: string;
      status: string;
      customer_name: string | null;
      customer_phone: string | null;
      total: Prisma.Decimal;
      payment_method: string;
      placed_at: Date;
    };
    const [totalRows, counts, rows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT count(*)::bigint AS count FROM orders o JOIN users u ON u.id = o.user_id
        WHERE true ${search} ${from} ${to} ${status}`),
      this.prisma.$queryRaw<{ status: string; count: bigint }[]>(Prisma.sql`
        SELECT o.status, count(*)::bigint AS count FROM orders o JOIN users u ON u.id = o.user_id
        WHERE true ${search} ${from} ${to} GROUP BY o.status`),
      this.prisma.$queryRaw<MonitorListRow[]>(Prisma.sql`
        SELECT o.id, o.order_number, o.status, u.name AS customer_name, u.phone AS customer_phone,
               o.total, o.payment_method, o.placed_at
        FROM orders o JOIN users u ON u.id = o.user_id
        WHERE true ${search} ${from} ${to} ${status}
        ORDER BY o.placed_at DESC, o.id DESC
        OFFSET ${(page - 1) * perPage} LIMIT ${perPage}`),
    ]);
    const statusCounts: Record<string, number> = Object.fromEntries(
      ORDER_STATUSES.map((value) => [value, 0]),
    );
    for (const row of counts) statusCounts[row.status] = Number(row.count);
    statusCounts.all = counts.reduce((sum, row) => sum + Number(row.count), 0);
    return {
      page,
      per_page: perPage,
      total: Number(totalRows[0]?.count ?? 0n),
      status_counts: statusCounts,
      data: rows.map((row) => ({ ...row, total: Number(row.total) })),
    };
  }

  async getMonitor(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, phone: true } },
        items: { orderBy: { id: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      customer: order.user,
      shipping_snapshot: {
        contact_phone: order.delivery_contact_phone,
        address_label: order.delivery_address_label,
        city: order.delivery_city,
        area: order.delivery_area,
        street: order.delivery_street,
        details: order.delivery_details,
        lat: order.delivery_lat,
        lng: order.delivery_lng,
      },
      items: order.items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name_ar: item.product_name_ar,
        product_name_en: item.product_name_en,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        line_total: Number(item.line_total),
        currency: item.currency_code,
      })),
      currency: order.currency_code,
      subtotal: Number(order.subtotal),
      delivery_fee: Number(order.delivery_fee),
      discount: Number(order.discount),
      total: Number(order.total),
      payment_method: order.payment_method,
      placed_at: order.placed_at,
    };
  }

  private normalizeArabic(value: string) {
    return value
      .toLowerCase()
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ء/g, '');
  }

  async track(userId: string, id: string) {
    await this.getOwned(userId, id);
    const events = await this.prisma.orderStatusEvent.findMany({
      where: { order_id: id },
      orderBy: [{ at: 'asc' }, { id: 'asc' }],
    });
    return {
      order_id: id,
      events: events.map(({ status, note, at }) => ({ status, note, at })),
    };
  }

  async cancel(userId: string, id: string, input: CustomerCancelDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.user_id !== userId)
        throw new ForbiddenException('Order belongs to another customer');
      await this.cancelOrder(
        tx,
        order,
        ['pending'],
        userId,
        'Cancelled by customer',
        input.version,
      );
    });
    return this.getOwned(userId, id);
  }

  async cancelAdmin(actorId: string, id: string, input: CancelOrderDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      await this.cancelOrder(
        tx,
        order,
        cancellableStatuses,
        actorId,
        input.reason,
        input.version,
      );
    });
    return this.getAdmin(id);
  }

  async rejectAdmin(actorId: string, id: string, input: RejectOrderDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      assertOrderTransition(
        order.status,
        'rejected',
        order.version,
        input.version,
      );
      const updated = await tx.order.updateMany({
        where: { id, status: 'pending', version: input.version },
        data: { status: 'rejected', version: { increment: 1 } },
      });
      if (!updated.count) {
        throw new ConflictException('Only a pending order can be rejected');
      }
      const now = new Date();
      await tx.orderStatusEvent.create({
        data: {
          order_id: id,
          status: 'rejected',
          note: input.reason,
          at: now,
        },
      });
      await this.inventory.releaseOrder(tx, id, actorId);
      await this.audit.record(tx, {
        actorId,
        action: 'order.reject',
        entityType: 'order',
        entityId: id,
        before: { status: order.status },
        after: { status: 'rejected', reason: input.reason },
      });
      await this.recordOrderNotification(tx, id, 'rejected');
      await this.notifications?.recordOrderMonitors(
        tx,
        'order_rejected',
        id,
        now.toISOString(),
      );
    });
    return this.getAdmin(id);
  }

  async requestCancellation(
    userId: string,
    id: string,
    input: CancellationRequestDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.user_id !== userId)
        throw new ForbiddenException('Order belongs to another customer');
      if (order.version !== input.version)
        throw staleOrder(order.status, order.version);
      if (
        ![
          'confirmed',
          'preparing',
          'ready_for_dispatch',
          'dispatched',
          'failed',
        ].includes(order.status)
      ) {
        throw new ConflictException(
          order.status === 'pending'
            ? 'A pending order can be cancelled directly'
            : 'This order cannot receive a cancellation request',
        );
      }
      if (order.cancellation_request_status === 'pending')
        throw new ConflictException(
          'A cancellation request is already pending',
        );
      const now = new Date();
      await tx.order.update({
        where: { id },
        data: {
          version: { increment: 1 },
          cancellation_request_status: 'pending',
          cancellation_request_reason: input.reason,
          cancellation_requested_at: now,
          cancellation_resolved_at: null,
          cancellation_resolved_by: null,
          cancellation_resolution_note: null,
        },
      });
      await this.audit.record(tx, {
        actorId: userId,
        action: 'order.cancellation_request.create',
        entityType: 'order',
        entityId: id,
        before: { status: order.status },
        after: { status: order.status, reason: input.reason },
      });
    });
    return this.getOwned(userId, id);
  }

  async resolveCancellationRequest(
    actorId: string,
    id: string,
    input: ResolveCancellationRequestDto,
    permissions: string[] = [],
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.version !== input.version)
        throw staleOrder(order.status, order.version);
      if (order.cancellation_request_status !== 'pending')
        throw new ConflictException('No cancellation request is pending');
      assertDifferentActor(
        actorId,
        order.user_id,
        'The cancellation requester cannot resolve their own request',
      );
      const now = new Date();
      if (input.decision === 'denied') {
        await tx.order.update({
          where: { id },
          data: {
            version: { increment: 1 },
            cancellation_request_status: 'denied',
            cancellation_resolved_at: now,
            cancellation_resolved_by: actorId,
            cancellation_resolution_note: input.reason,
          },
        });
      } else if (
        ['pending', 'confirmed', 'preparing', 'ready_for_dispatch'].includes(
          order.status,
        )
      ) {
        await this.cancelOrder(
          tx,
          order,
          cancellableStatuses,
          actorId,
          input.reason,
          input.version,
          true,
        );
      } else if (['dispatched', 'failed'].includes(order.status)) {
        if (!permissions.includes('orders.cancel_after_dispatch')) {
          throw new ForbiddenException(
            'Missing orders.cancel_after_dispatch permission',
          );
        }
        assertOrderTransition(
          order.status,
          'cancelled',
          order.version,
          input.version,
        );
        await tx.order.update({
          where: { id },
          data: {
            status: 'cancelled',
            version: { increment: 1 },
            cancellation_request_status: 'approved',
            cancellation_resolved_at: now,
            cancellation_resolved_by: actorId,
            cancellation_resolution_note: input.reason,
          },
        });
        await tx.orderStatusEvent.create({
          data: {
            order_id: id,
            status: 'cancelled',
            note: input.reason,
            at: now,
          },
        });
        await this.inventory.openRetrieval(
          tx,
          id,
          actorId,
          'cancel',
          input.reason,
          `cancel:${id}:${input.version}`,
        );
        await this.recordOrderNotification(tx, id, 'cancelled');
        await this.notifications?.recordOrderMonitors(
          tx,
          'order_cancelled',
          id,
          now.toISOString(),
        );
      } else {
        throw new ConflictException('This order can no longer be cancelled');
      }
      await this.audit.record(tx, {
        actorId,
        action: 'order.cancellation_request.resolve',
        entityType: 'order',
        entityId: id,
        before: { status: order.status, request_status: 'pending' },
        after: { decision: input.decision, reason: input.reason },
      });
    });
    return this.getAdmin(id);
  }

  async resolveShortage(
    actorId: string,
    id: string,
    input: ResolveShortageDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.version !== input.version)
        throw staleOrder(order.status, order.version);
      if (order.status !== 'preparing' || !order.inventory_attention_required)
        throw new ConflictException(
          'Order does not have a preparation shortage',
        );
      if (input.action === 'cancel_order') {
        await this.cancelOrder(
          tx,
          order,
          ['preparing'],
          actorId,
          input.reason,
          input.version,
        );
        return;
      }
      const item = await tx.orderItem.findFirst({
        where: { id: input.order_item_id, order_id: id },
      });
      if (!item) throw new NotFoundException('Order item not found');
      const attention = this.attentionDetails(order.attention_details);
      const shortLines = attention.short_lines.filter(
        (line) => line.order_item_id !== item.id,
      );
      if (input.action === 'reduce') {
        if (
          input.new_quantity === undefined ||
          input.new_quantity >= Number(item.quantity)
        ) {
          throw new UnprocessableEntityException(
            'new_quantity must be lower than the ordered quantity',
          );
        }
        await tx.order.update({
          where: { id },
          data: {
            version: { increment: 1 },
            attention_details: {
              ...attention,
              reduction_proposal: {
                order_item_id: item.id,
                old_quantity: Number(item.quantity),
                new_quantity: input.new_quantity,
                reason: input.reason,
                status: 'pending',
                requested_by: actorId,
                requested_at: new Date().toISOString(),
              },
            },
          },
        });
      } else {
        await this.applyLineQuantity(tx, order, item, 0, actorId);
        await tx.order.update({
          where: { id },
          data: {
            version: { increment: 1 },
            inventory_attention_required: shortLines.length > 0,
            attention_details: shortLines.length
              ? { short_lines: shortLines }
              : Prisma.DbNull,
          },
        });
      }
      await this.audit.record(tx, {
        actorId,
        action: `order.shortage.${input.action}`,
        entityType: 'order',
        entityId: id,
        before: { status: order.status, attention: order.attention_details },
        after: { order_item_id: item.id, reason: input.reason },
      });
    });
    return this.getAdmin(id);
  }

  async respondToShortage(
    userId: string,
    id: string,
    input: ShortageResponseDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.user_id !== userId)
        throw new ForbiddenException('Order belongs to another customer');
      if (order.version !== input.version)
        throw staleOrder(order.status, order.version);
      const attention = this.attentionDetails(order.attention_details);
      const proposal = attention.reduction_proposal;
      if (!proposal || proposal.status !== 'pending')
        throw new ConflictException(
          'No quantity reduction is awaiting acceptance',
        );
      const item = await tx.orderItem.findFirst({
        where: { id: proposal.order_item_id, order_id: id },
      });
      if (!item) throw new NotFoundException('Order item not found');
      if (input.decision === 'accepted') {
        await this.applyLineQuantity(
          tx,
          order,
          item,
          proposal.new_quantity,
          userId,
        );
      }
      const shortLines =
        input.decision === 'accepted'
          ? attention.short_lines.filter(
              (line) => line.order_item_id !== item.id,
            )
          : attention.short_lines;
      await tx.order.update({
        where: { id },
        data: {
          version: { increment: 1 },
          inventory_attention_required: shortLines.length > 0,
          attention_details: {
            ...attention,
            short_lines: shortLines,
            reduction_proposal: {
              ...proposal,
              status: input.decision,
              resolved_at: new Date().toISOString(),
            },
          },
        },
      });
      await this.audit.record(tx, {
        actorId: userId,
        action: 'order.shortage.customer_response',
        entityType: 'order',
        entityId: id,
        after: { decision: input.decision, order_item_id: item.id },
      });
    });
    return this.getOwned(userId, id);
  }

  private attentionDetails(value: Prisma.JsonValue | null) {
    type ShortLine = {
      order_item_id: string;
      variant_id: string;
      requested: string;
      allocated: string;
      short: string;
    };
    type Proposal = {
      order_item_id: string;
      old_quantity: number;
      new_quantity: number;
      reason: string;
      status: string;
      requested_by: string;
      requested_at: string;
      resolved_at?: string;
    };
    const object =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return {
      short_lines: Array.isArray(object.short_lines)
        ? (object.short_lines as ShortLine[])
        : [],
      reduction_proposal:
        object.reduction_proposal &&
        typeof object.reduction_proposal === 'object'
          ? (object.reduction_proposal as Proposal)
          : undefined,
    };
  }

  private async applyLineQuantity(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      discount: Prisma.Decimal;
      delivery_fee: Prisma.Decimal;
    },
    item: { id: string; unit_price: Prisma.Decimal },
    quantity: number,
    actorId: string,
  ) {
    await this.inventory.reduceOrderItemReservations(
      tx,
      item.id,
      new Prisma.Decimal(quantity),
      actorId,
    );
    await tx.orderItem.update({
      where: { id: item.id },
      data: {
        quantity,
        line_total: calculateLineTotal(item.unit_price, quantity),
      },
    });
    const totals = await tx.orderItem.aggregate({
      where: { order_id: order.id },
      _sum: { line_total: true },
    });
    const subtotal = totals._sum.line_total ?? new Prisma.Decimal(0);
    const discount = Prisma.Decimal.min(order.discount, subtotal);
    await tx.order.update({
      where: { id: order.id },
      data: {
        subtotal,
        discount,
        total: subtotal.minus(discount).plus(order.delivery_fee),
      },
    });
  }

  async updateStatus(
    actorId: string,
    id: string,
    input: UpdateOrderStatusDto,
    permissions: string[] = [],
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      assertOrderTransition(
        order.status,
        input.status,
        order.version,
        input.version,
      );
      let belowCostBreaches: Awaited<
        ReturnType<BelowCostService['assertAllowed']>
      > = [];
      if (input.status === 'confirmed' && this.belowCost) {
        const priced = await tx.orderItem.findMany({
          where: { order_id: id },
          include: { variant: { select: { sku: true } } },
        });
        belowCostBreaches = await this.belowCost.assertAllowed(
          tx,
          actorId,
          permissions,
          priced.map((item) => ({
            variant_id: item.variant_id,
            sku: item.variant.sku,
            price: Number(item.unit_price),
          })),
          {
            reason: input.below_cost_override_reason,
            originatorId: order.user_id,
          },
        );
      }
      const now = new Date();
      if (
        input.status === 'ready_for_dispatch' &&
        order.inventory_attention_required
      ) {
        throw new ConflictException({
          status: 409,
          code: 'ORDER_NEEDS_ATTENTION',
          message:
            'Resolve preparation shortages before marking the order ready',
          errors: [],
        });
      }
      if (input.status === 'preparing') {
        await this.inventory.prepareOrder(tx, id, actorId);
      }
      let delivery: Awaited<ReturnType<typeof tx.delivery.findUnique>> | null =
        null;
      if (input.status === 'dispatched') {
        if (!order.delivery_id) {
          throw new ConflictException('Order has no current delivery');
        }
        await tx.$queryRaw`SELECT id FROM deliveries WHERE id = ${order.delivery_id}::uuid FOR UPDATE`;
        delivery = await tx.delivery.findUnique({
          where: { id: order.delivery_id },
        });
        if (
          !delivery ||
          delivery.order_id !== id ||
          delivery.status !== 'assigned' ||
          !delivery.agent_id
        ) {
          throw new ConflictException(
            'Dispatch requires the current delivery to have an assigned agent',
          );
        }
      }
      const updated = await tx.order.updateMany({
        where: { id, status: order.status, version: input.version },
        data: { status: input.status, version: { increment: 1 } },
      });
      if (!updated.count) {
        const current = await tx.order.findUniqueOrThrow({ where: { id } });
        throw staleOrder(current.status, current.version);
      }
      await tx.orderStatusEvent.create({
        data: {
          order_id: id,
          status: input.status,
          note: input.note ?? null,
          at: now,
        },
      });
      await this.audit.record(tx, {
        actorId,
        action:
          input.status === 'dispatched' ? 'order.dispatch' : 'order.transition',
        entityType: 'order',
        entityId: id,
        before: { status: order.status },
        after: { status: input.status, note: input.note ?? null },
      });
      if (belowCostBreaches.length) {
        await this.audit.record(tx, {
          actorId,
          action: 'order.below_cost.override',
          entityType: 'order',
          entityId: id,
          after: { variants: belowCostBreaches },
          reason: input.below_cost_override_reason ?? undefined,
        });
      }
      if (input.status === 'dispatched' && delivery) {
        await this.inventory.issueOrderToCustody(
          tx,
          id,
          delivery.id,
          delivery.agent_id!,
          actorId,
        );
        await tx.delivery.update({
          where: { id: delivery.id },
          data: { status: 'out_for_delivery', dispatched_at: now },
        });
        await this.audit.record(tx, {
          actorId,
          action: 'delivery.dispatch',
          entityType: 'delivery',
          entityId: delivery.id,
          before: { status: delivery.status, agent_id: delivery.agent_id },
          after: {
            status: 'out_for_delivery',
            agent_id: delivery.agent_id,
          },
        });
      }
      await this.recordOrderNotification(tx, id, input.status);
    });
    return this.getAdmin(id);
  }

  private async cancelOrder(
    tx: Prisma.TransactionClient,
    order: { id: string; status: string; version: number },
    allowed: readonly string[],
    actorId: string,
    reason: string,
    expectedVersion: number,
    approvingRequest = false,
  ) {
    const id = order.id;
    const paidCod = await tx.payment.count({
      where: { order_id: id, method: 'cod', status: 'paid' },
    });
    if (paidCod) {
      throw new ConflictException('A paid COD order cannot be cancelled');
    }
    assertOrderTransition(
      order.status,
      'cancelled',
      order.version,
      expectedVersion,
    );
    const updated = await tx.order.updateMany({
      where: {
        id,
        status: { in: [...allowed] },
        version: expectedVersion,
      },
      data: {
        status: 'cancelled',
        version: { increment: 1 },
        ...(approvingRequest
          ? {
              cancellation_request_status: 'approved',
              cancellation_resolved_at: new Date(),
              cancellation_resolved_by: actorId,
              cancellation_resolution_note: reason,
            }
          : {}),
      },
    });
    if (!updated.count)
      throw new ConflictException('Order status transition is not allowed');
    const now = new Date();
    await tx.orderStatusEvent.create({
      data: { order_id: id, status: 'cancelled', note: reason, at: now },
    });
    await this.inventory.releaseOrder(tx, id, actorId);
    await this.audit.record(tx, {
      actorId,
      action: 'order.cancel',
      entityType: 'order',
      entityId: id,
      before: { status: order.status },
      after: { status: 'cancelled', reason },
    });
    await this.recordOrderNotification(tx, id, 'cancelled');
    await this.notifications?.recordOrderMonitors(
      tx,
      'order_cancelled',
      id,
      now.toISOString(),
    );
  }

  private async recordOrderNotification(
    tx: Prisma.TransactionClient,
    id: string,
    status: OrderStatus,
  ) {
    if (!this.notifications) return;
    const order = await tx.order.findUniqueOrThrow({ where: { id } });
    const type =
      status === 'rejected'
        ? 'order_rejected'
        : status === 'confirmed'
          ? 'order_confirmed'
          : status === 'dispatched'
            ? 'out_for_delivery'
            : 'order_status_changed';
    await this.notifications.record(
      tx,
      order.user_id,
      type,
      'order',
      id,
      type === 'order_status_changed' ? status : '',
    );
  }

  private toResponse(row: OrderRow) {
    return {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      version: row.version,
      payment_method: row.payment_method,
      address_id: row.address_id,
      delivery_id: row.delivery_id,
      subtotal: Number(row.subtotal),
      delivery_fee: Number(row.delivery_fee),
      discount: Number(row.discount),
      total: Number(row.total),
      currency: row.currency_code,
      delivery_contact_phone: row.delivery_contact_phone,
      delivery_address_label: row.delivery_address_label,
      delivery_city: row.delivery_city,
      delivery_area: row.delivery_area,
      delivery_street: row.delivery_street,
      delivery_details: row.delivery_details,
      delivery_lat: row.delivery_lat,
      delivery_lng: row.delivery_lng,
      placed_at: row.placed_at,
      acceptance_deadline: row.acceptance_deadline,
      auto_cancel_deadline: row.auto_cancel_deadline,
      late_for_acceptance: row.late_for_acceptance,
      cancellation_request: row.cancellation_request_status
        ? {
            status: row.cancellation_request_status,
            reason: row.cancellation_request_reason,
            requested_at: row.cancellation_requested_at,
            resolved_at: row.cancellation_resolved_at,
            resolution_note: row.cancellation_resolution_note,
          }
        : null,
      price_change_info: row.price_change_info,
      inventory_attention_required: row.inventory_attention_required,
      attention_details: row.attention_details,
      timeline: (row.status_events ?? []).map(({ status, note, at }) => ({
        status,
        note,
        at,
      })),
      retrievals: (row.retrievals ?? []).map(
        ({ id, document_number, status, outcome }) => ({
          id,
          document_number,
          status,
          outcome,
        }),
      ),
      items: row.items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name_ar: item.product_name_ar,
        product_name_en: item.product_name_en,
        image_url: item.image_url,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        price_version: item.price_version,
        line_total: Number(item.line_total),
        currency: item.currency_code,
        reviewed: Boolean(item.reviewed),
      })),
    };
  }

  private toAdminResponse(row: AdminOrderRow) {
    const base = this.toResponse(row);
    return {
      ...base,
      customer: row.user,
      shipping_snapshot: {
        contact_phone: row.delivery_contact_phone,
        address_label: row.delivery_address_label,
        city: row.delivery_city,
        area: row.delivery_area,
        street: row.delivery_street,
        details: row.delivery_details,
        lat: row.delivery_lat,
        lng: row.delivery_lng,
      },
      payments: row.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: Number(payment.amount),
        currency: payment.currency_code,
        paid_at: payment.paid_at,
      })),
      delivery: row.delivery
        ? {
            id: row.delivery.id,
            status: row.delivery.status,
            delivery_fee: Number(row.delivery.delivery_fee),
            currency: row.delivery.currency_code,
            dispatched_at: row.delivery.dispatched_at,
            delivered_at: row.delivery.delivered_at,
            failure_reason: row.delivery.failure_reason,
            failed_at: row.delivery.failed_at,
            retry_count: row.delivery.retry_count,
            agent: row.delivery.agent,
          }
        : null,
      status_events: row.status_events.map(({ status, note, at }) => ({
        status,
        note,
        at,
      })),
    };
  }
}
