import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from '../catalog/products.service';
import { calculateLineTotal } from '../catalog/pricing';
import {
  activeCoupon,
  calculateCartTotals,
  cartUnitPrice,
  MAX_CART_ITEM_QUANTITY,
} from './cart-pricing';
import {
  OrderQueryDto,
  OrderStatus,
  PlaceOrderDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';

const nextStatuses: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'failed_delivery'],
  failed_delivery: ['out_for_delivery', 'cancelled'],
  delivered: ['return_requested'],
  return_requested: ['returned'],
  returned: [],
  cancelled: [],
};
const orderInclude = { items: true } satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
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
      const lines = [];
      for (const item of cart.items) {
        if (item.quantity < 1 || item.quantity > MAX_CART_ITEM_QUANTITY) {
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
        const [stock, reserved, held] = await Promise.all([
          tx.batchStock.findMany({
            where: {
              batch: {
                product_id: item.product_id,
                variant_id: item.variant_id,
              },
            },
            select: { quantity: true },
          }),
          tx.stockReservation.findMany({
            where: {
              status: 'reserved',
              batch: {
                product_id: item.product_id,
                variant_id: item.variant_id,
              },
            },
            select: { quantity: true },
          }),
          tx.simpleStockHold.findMany({
            where: {
              product_id: item.product_id,
              variant_id: item.variant_id,
              released_at: null,
            },
            select: { quantity: true },
          }),
        ]);
        const available =
          stock.reduce((sum, row) => sum + row.quantity, 0) -
          reserved.reduce((sum, row) => sum + row.quantity, 0) -
          held.reduce((sum, row) => sum + row.quantity, 0);
        const alreadyRequested = lines
          .filter(
            (line) =>
              line.product_id === item.product_id &&
              line.variant_id === item.variant_id,
          )
          .reduce((sum, line) => sum + line.quantity, 0);
        if (available < alreadyRequested + item.quantity)
          throw new ConflictException(
            'Requested quantity exceeds available stock',
          );
        const unit_price = cartUnitPrice(
          product,
          variant?.price_delta ?? 0,
          at,
        );
        lines.push({
          product_id: product.id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_price,
          line_total: calculateLineTotal(unit_price, item.quantity),
          product_name_ar: product.name_ar,
          product_name_en: product.name_en,
          image_url: product.images[0]?.url ?? null,
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
            create: { method: 'cod', status: 'pending', amount: totals.total },
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
      await tx.simpleStockHold.createMany({
        data: order.items.map((entry) => ({
          order_id: order.id,
          order_item_id: entry.id,
          product_id: entry.product_id,
          variant_id: entry.variant_id,
          quantity: entry.quantity,
        })),
      });
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
      return order.id;
    });
    return this.getOwned(userId, orderId);
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
        orderBy: { placed_at: 'desc' },
        skip: (page - 1) * per_page,
        take: per_page,
      }),
    ]);
    return {
      page,
      per_page,
      total,
      data: await Promise.all(rows.map((row) => this.toResponse(row, userId))),
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
    return this.toResponse(order, userId);
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

  async cancel(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      if (order.user_id !== userId)
        throw new ForbiddenException('Order belongs to another customer');
      await this.transition(
        tx,
        id,
        'cancelled',
        ['pending', 'confirmed'],
        userId,
      );
    });
    return this.getOwned(userId, id);
  }

  async updateStatus(actorId: string, id: string, input: UpdateOrderStatusDto) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');
      const allowed = nextStatuses[order.status as OrderStatus] ?? [];
      if (!allowed.includes(input.status)) {
        throw new ConflictException('Order status transition is not allowed');
      }
      await this.transition(
        tx,
        id,
        input.status,
        [order.status],
        actorId,
        input.note,
      );
    });
    const row = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude,
    });
    return this.toResponse(row, row.user_id);
  }

  private async transition(
    tx: Prisma.TransactionClient,
    id: string,
    status: OrderStatus,
    allowed: readonly string[],
    _actorId: string,
    note?: string | null,
  ) {
    const updated = await tx.order.updateMany({
      where: { id, status: { in: [...allowed] } },
      data: { status },
    });
    if (!updated.count)
      throw new ConflictException('Order status transition is not allowed');
    await tx.orderStatusEvent.create({
      data: { order_id: id, status, note: note ?? null },
    });
    if (status === 'cancelled') {
      await tx.simpleStockHold.updateMany({
        where: { order_id: id, released_at: null },
        data: { released_at: new Date() },
      });
    }
    if (
      ['out_for_delivery', 'delivered', 'failed_delivery', 'returned'].includes(
        status,
      )
    ) {
      const deliveryStatus = status === 'failed_delivery' ? 'failed' : status;
      await tx.delivery.updateMany({
        where: { order_id: id },
        data: {
          status: deliveryStatus,
          ...(status === 'out_for_delivery'
            ? { dispatched_at: new Date() }
            : {}),
          ...(status === 'delivered' ? { delivered_at: new Date() } : {}),
        },
      });
    }
  }

  private async toResponse(row: OrderRow, userId: string) {
    const reviews = await this.prisma.productReview.findMany({
      where: {
        user_id: userId,
        order_item_id: { in: row.items.map((item) => item.id) },
      },
      select: { order_item_id: true },
    });
    const reviewed = new Set(reviews.map((review) => review.order_item_id));
    return {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      payment_method: row.payment_method,
      address_id: row.address_id,
      delivery_id: row.delivery_id,
      subtotal: Number(row.subtotal),
      delivery_fee: Number(row.delivery_fee),
      discount: Number(row.discount),
      total: Number(row.total),
      delivery_contact_phone: row.delivery_contact_phone,
      delivery_address_label: row.delivery_address_label,
      delivery_city: row.delivery_city,
      delivery_area: row.delivery_area,
      delivery_street: row.delivery_street,
      delivery_details: row.delivery_details,
      delivery_lat: row.delivery_lat,
      delivery_lng: row.delivery_lng,
      placed_at: row.placed_at,
      items: row.items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_name_ar: item.product_name_ar,
        product_name_en: item.product_name_en,
        image_url: item.image_url,
        quantity: item.quantity,
        unit_price: Number(item.unit_price),
        line_total: Number(item.line_total),
        reviewed: reviewed.has(item.id),
      })),
    };
  }
}
