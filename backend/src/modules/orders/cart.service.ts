import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from '../catalog/products.service';
import { calculateLineTotal } from '../catalog/pricing';
import {
  AddCartItemDto,
  UpdateCartItemDto,
  ValidateCouponDto,
} from './dto/cart.dto';
import {
  activeCoupon,
  calculateCartTotals,
  cartUnitPrice,
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

  async add(userId: string, input: AddCartItemDto) {
    const variantId = input.variant_id ?? null;
    const { unitPrice, availableQty } = await this.sellable(
      input.product_id,
      variantId,
    );
    const { id: cartId } = await this.getOrCreate(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, cartId);
      const existing = await tx.cartItem.findFirst({
        where: {
          cart_id: cartId,
          product_id: input.product_id,
          variant_id: variantId,
        },
      });
      const quantity = (existing?.quantity ?? 0) + input.quantity;
      this.requireAvailable(quantity, availableQty);
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity, unit_price: unitPrice },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cart_id: cartId,
            product_id: input.product_id,
            variant_id: variantId,
            quantity,
            unit_price: unitPrice,
          },
        });
      }
      await tx.cart.update({
        where: { id: cartId },
        data: { updated_at: new Date() },
      });
    });
    return this.response(cartId);
  }

  async update(userId: string, id: string, input: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id, cart: { user_id: userId } },
    });
    if (!item) throw new NotFoundException('Cart item not found');
    const { unitPrice, availableQty } = await this.sellable(
      item.product_id,
      item.variant_id,
    );
    this.requireAvailable(input.quantity, availableQty);
    await this.prisma.cartItem.update({
      where: { id },
      data: { quantity: input.quantity, unit_price: unitPrice },
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
    const items = await Promise.all(
      cart.items.map(async (item) => {
        const unit_price = cartUnitPrice(
          item.product,
          item.variant?.price_delta ?? 0,
          at,
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
          quantity: item.quantity,
          unit_price,
          line_total: calculateLineTotal(unit_price, item.quantity),
          currency: item.currency_code,
          available_qty,
          available: available_qty >= item.quantity,
        };
      }),
    );
    const coupon = activeCoupon(cart.coupon, at) ? cart.coupon : null;
    return {
      id: cart.id,
      coupon_code: coupon?.code ?? null,
      currency: 'IQD',
      items,
      ...calculateCartTotals(items, coupon, at),
    };
  }

  private async sellable(productId: string, variantId: string | null) {
    const product = await this.products.getPublic(productId);
    const variant = variantId
      ? product.variants.find((entry) => entry.id === variantId)
      : null;
    if (variantId && !variant) {
      throw new UnprocessableEntityException(
        'Variant does not belong to product',
      );
    }
    const availability = await this.products.availability(productId, true);
    const availableQty =
      availability.variants.find((entry) => entry.variant_id === variantId)
        ?.available_qty ?? 0;
    return {
      unitPrice: cartUnitPrice(product, variant?.price_delta ?? 0),
      availableQty,
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

  private async lockCart(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM carts WHERE id = ${id}::uuid FOR UPDATE`;
  }
}
