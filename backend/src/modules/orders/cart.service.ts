import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from '../catalog/products.service';
import { calculateLineTotal } from '../catalog/pricing';
import {
  AddCartItemDto,
  MergeCartDto,
  UpdateCartItemDto,
  ValidateCouponDto,
} from './dto/cart.dto';
import {
  activeCoupon,
  calculateCartTotals,
  skuUnitPrice,
  skuPriceVersion,
  MAX_CART_ITEM_QUANTITY,
} from './cart-pricing';

const cartInclude = {
  coupon: true,
  items: {
    include: { product: true, variant: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.CartInclude;

type CartRow = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async get(userId: string) {
    const { id } = await this.getOrCreate(userId);
    return this.response(id);
  }

  async add(userId: string, input: AddCartItemDto, rawKey?: string) {
    const key = this.idempotencyKey(rawKey, false);
    const sellable = await this.sellable(
      input.product_id,
      input.variant_id ?? null,
    );
    const variantId = sellable.variantId;
    const { unitPrice, availableQty, priceVersion } = sellable;
    this.requireQuantityUnit(input.quantity, sellable.wholeUnitsOnly);
    const { id: cartId } = await this.getOrCreate(userId);
    const fingerprint = this.fingerprint('add', [
      {
        product_id: input.product_id,
        variant_id: variantId,
        quantity: input.quantity,
      },
    ]);
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, cartId);
      if (key && (await this.replayed(tx, cartId, key, 'add', fingerprint))) {
        return;
      }
      const existing = await tx.cartItem.findFirst({
        where: {
          cart_id: cartId,
          product_id: input.product_id,
          variant_id: variantId,
        },
      });
      const quantity = Number(existing?.quantity ?? 0) + input.quantity;
      this.requireAvailable(quantity, availableQty);
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity,
            unit_price: unitPrice,
            price_version: priceVersion,
          },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cart_id: cartId,
            product_id: input.product_id,
            variant_id: variantId,
            quantity,
            unit_price: unitPrice,
            price_version: priceVersion,
          },
        });
      }
      await tx.cart.update({
        where: { id: cartId },
        data: { updated_at: new Date() },
      });
      if (key) {
        await tx.cartMutation.create({
          data: {
            cart_id: cartId,
            idempotency_key: key,
            fingerprint,
            kind: 'add',
          },
        });
      }
    });
    return this.response(cartId);
  }

  async merge(userId: string, input: MergeCartDto, rawKey?: string) {
    const key = this.idempotencyKey(rawKey, true)!;
    const combined = new Map<
      string,
      { product_id: string; variant_id: string | null; quantity: number }
    >();
    for (const item of input.items) {
      const mapKey = `${item.product_id}:${item.variant_id ?? ''}`;
      const existing = combined.get(mapKey);
      combined.set(mapKey, {
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        quantity: Number(
          ((existing?.quantity ?? 0) + item.quantity).toFixed(3),
        ),
      });
    }
    const requested = [...combined.values()].sort((left, right) =>
      `${left.product_id}:${left.variant_id ?? ''}`.localeCompare(
        `${right.product_id}:${right.variant_id ?? ''}`,
      ),
    );
    const prepared = await Promise.all(
      requested.map(async (item) => {
        const sellable = await this.sellable(item.product_id, item.variant_id);
        this.requireQuantityUnit(item.quantity, sellable.wholeUnitsOnly);
        return { ...item, sellable };
      }),
    );
    const fingerprint = this.fingerprint('merge', requested);
    const { id: cartId } = await this.getOrCreate(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, cartId);
      if (await this.replayed(tx, cartId, key, 'merge', fingerprint)) return;
      for (const item of prepared) {
        const existing = await tx.cartItem.findFirst({
          where: {
            cart_id: cartId,
            product_id: item.product_id,
            variant_id: item.sellable.variantId,
          },
        });
        const quantity = Number(existing?.quantity ?? 0) + item.quantity;
        this.requireAvailable(quantity, item.sellable.availableQty);
        if (existing) {
          await tx.cartItem.update({
            where: { id: existing.id },
            data: {
              quantity,
              unit_price: item.sellable.unitPrice,
              price_version: item.sellable.priceVersion,
            },
          });
        } else {
          await tx.cartItem.create({
            data: {
              cart_id: cartId,
              product_id: item.product_id,
              variant_id: item.sellable.variantId,
              quantity,
              unit_price: item.sellable.unitPrice,
              price_version: item.sellable.priceVersion,
            },
          });
        }
      }
      await tx.cart.update({
        where: { id: cartId },
        data: { updated_at: new Date() },
      });
      await tx.cartMutation.create({
        data: {
          cart_id: cartId,
          idempotency_key: key,
          fingerprint,
          kind: 'merge',
        },
      });
    });
    return this.response(cartId);
  }

  async update(userId: string, id: string, input: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id, cart: { user_id: userId } },
    });
    if (!item) throw new NotFoundException('Cart item not found');
    const sellable = await this.sellable(item.product_id, item.variant_id);
    const { unitPrice, availableQty, priceVersion } = sellable;
    this.requireQuantityUnit(input.quantity, sellable.wholeUnitsOnly);
    this.requireAvailable(input.quantity, availableQty);
    await this.prisma.cartItem.update({
      where: { id },
      data: {
        quantity: input.quantity,
        unit_price: unitPrice,
        price_version: priceVersion,
      },
    });
    await this.prisma.cart.update({
      where: { id: item.cart_id },
      data: { updated_at: new Date() },
    });
    return this.response(item.cart_id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const removed = await this.prisma.cartItem.deleteMany({
      where: { id, cart: { user_id: userId } },
    });
    if (!removed.count) throw new NotFoundException('Cart item not found');
  }

  async applyCoupon(userId: string, input: ValidateCouponDto) {
    const coupon = await this.prisma.coupon.findFirst({
      where: { code: { equals: input.code.trim(), mode: 'insensitive' } },
    });
    if (!activeCoupon(coupon)) throw new NotFoundException('Coupon not found');
    const { id } = await this.getOrCreate(userId);
    await this.prisma.cart.update({
      where: { id },
      data: { coupon_id: coupon!.id },
    });
    return {
      code: coupon!.code,
      type: coupon!.type,
      value: Number(coupon!.value),
      currency: coupon!.currency_code,
    };
  }

  async removeCoupon(userId: string) {
    const { id } = await this.getOrCreate(userId);
    await this.prisma.cart.update({
      where: { id },
      data: { coupon_id: null, updated_at: new Date() },
    });
    return this.response(id);
  }

  private async getOrCreate(userId: string) {
    return this.prisma.cart.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId },
      select: { id: true },
    });
  }

  private async response(cartId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: cartInclude,
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return this.toResponse(cart);
  }

  private async toResponse(cart: CartRow) {
    const at = new Date();
    const [items, deliveryFeeSetting] = await Promise.all([
      Promise.all(
        cart.items.map(async (item) => {
          const currentUnitPrice = skuUnitPrice(item.product, item.variant, at);
          const currentPriceVersion = skuPriceVersion(
            item.product,
            item.variant,
            currentUnitPrice,
          );
          let available_qty = 0;
          try {
            const availability = await this.products.availability(
              item.product_id,
              true,
            );
            available_qty =
              availability.variants.find(
                (variant) => variant.variant_id === item.variant_id,
              )?.available_qty ?? 0;
          } catch (error) {
            if (!(error instanceof NotFoundException)) throw error;
          }
          return {
            id: item.id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            price_version: item.price_version,
            current_unit_price: currentUnitPrice,
            current_price_version: currentPriceVersion,
            price_changed:
              Number(item.unit_price) !== currentUnitPrice ||
              item.price_version !== currentPriceVersion,
            line_total: calculateLineTotal(
              Number(item.unit_price),
              Number(item.quantity),
            ),
            currency: item.currency_code,
            available_qty,
            available: available_qty >= Number(item.quantity),
          };
        }),
      ),
      this.prisma.storeSetting.findUnique({ where: { key: 'delivery_fee' } }),
    ]);
    const coupon = activeCoupon(cart.coupon, at) ? cart.coupon : null;
    return {
      id: cart.id,
      coupon_code: coupon?.code ?? null,
      currency: 'IQD',
      items,
      ...calculateCartTotals(
        items.map((item) => ({
          ...item,
          unit_price: item.current_unit_price,
        })),
        coupon,
        at,
        deliveryFeeSetting?.value ?? 0,
      ),
    };
  }

  private async sellable(productId: string, variantId: string | null) {
    const product = await this.products.getPublic(productId);
    const variant = variantId
      ? product.variants.find((entry) => entry.id === variantId)
      : product.variants.length === 1
        ? product.variants[0]
        : null;
    if (variantId && !variant) {
      throw new UnprocessableEntityException(
        'Variant does not belong to product',
      );
    }
    if (!variant) {
      throw new UnprocessableEntityException(
        'variant_id is required when a product has multiple SKUs',
      );
    }
    const availability = await this.products.availability(productId, true);
    const availableQty =
      availability.variants.find((entry) => entry.variant_id === variant.id)
        ?.available_qty ?? 0;
    return {
      unitPrice: variant.effective_price,
      priceVersion: skuPriceVersion(product, variant, variant.effective_price),
      availableQty,
      variantId: variant.id,
      wholeUnitsOnly: variant.whole_units_only,
    };
  }

  private requireAvailable(quantity: number, availableQty: number): void {
    if (quantity > MAX_CART_ITEM_QUANTITY) {
      throw new UnprocessableEntityException(
        `quantity must not exceed ${MAX_CART_ITEM_QUANTITY}`,
      );
    }
    if (quantity > availableQty) {
      throw new ConflictException('Requested quantity exceeds available stock');
    }
  }

  private requireQuantityUnit(quantity: number, wholeUnitsOnly: boolean): void {
    if (wholeUnitsOnly && !Number.isInteger(quantity)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'SKU_WHOLE_UNITS_ONLY',
        message: 'This SKU accepts whole-unit quantities only',
        errors: [],
      });
    }
  }

  private async lockCart(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM carts WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private idempotencyKey(rawKey: string | undefined, required: boolean) {
    const key = rawKey?.trim();
    if (!key && !required) return undefined;
    if (!key || key.length < 8 || key.length > 128) {
      throw new UnprocessableEntityException(
        'Idempotency-Key must contain between 8 and 128 characters',
      );
    }
    return key;
  }

  private fingerprint(
    kind: string,
    items: Array<{
      product_id: string;
      variant_id: string | null;
      quantity: number;
    }>,
  ) {
    return createHash('sha256')
      .update(JSON.stringify({ kind, items }))
      .digest('hex');
  }

  private async replayed(
    tx: Prisma.TransactionClient,
    cartId: string,
    key: string,
    kind: string,
    fingerprint: string,
  ) {
    const existing = await tx.cartMutation.findUnique({
      where: {
        cart_id_idempotency_key: {
          cart_id: cartId,
          idempotency_key: key,
        },
      },
    });
    if (!existing) return false;
    if (existing.kind !== kind || existing.fingerprint !== fingerprint) {
      throw new ConflictException({
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
        message:
          'Idempotency key was already used with a different cart change',
        errors: [],
      });
    }
    return true;
  }
}
