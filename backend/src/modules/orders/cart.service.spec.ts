jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../catalog/products.service', () => ({ ProductsService: class {} }));

import { ConflictException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';

const product = {
  id: 'product-1',
  category_id: 'category-1',
  price: '20.15',
  discount_type: 'percentage',
  discount_value: '50',
  discount_starts_at: new Date('2020-01-01'),
  discount_ends_at: new Date('2030-01-01'),
  variants: [{ id: 'variant-1', price_delta: 0 }],
};

describe('CartService', () => {
  it('reprices persisted lines from the current catalog instead of cached unit_price', async () => {
    const prisma = {
      cart: {
        upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'cart-1',
          coupon: null,
          items: [
            {
              id: 'item-1',
              product_id: 'product-1',
              variant_id: 'variant-1',
              quantity: 2,
              unit_price: '999.99',
              product,
              variant: { price_delta: '0.05' },
            },
          ],
        }),
      },
    };
    const products = {
      availability: jest.fn().mockResolvedValue({
        variants: [{ variant_id: 'variant-1', available_qty: 4 }],
      }),
    };
    const service = new CartService(prisma as never, products as never);

    expect(await service.get('user-1')).toEqual({
      id: 'cart-1',
      coupon_code: null,
      items: [
        {
          id: 'item-1',
          product_id: 'product-1',
          variant_id: 'variant-1',
          quantity: 2,
          unit_price: 10.13,
          line_total: 20.26,
          available_qty: 4,
          available: true,
        },
      ],
      subtotal: 20.26,
      discount: 0,
      delivery_fee: 0,
      total: 20.26,
    });
    expect(prisma.cart.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'user-1' } }),
    );
  });

  it('rejects an add above per-variant stock without writing a line', async () => {
    const tx = {
      $queryRaw: jest.fn(),
      cartItem: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    };
    const prisma = {
      cart: { upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    };
    const products = {
      getPublic: jest.fn().mockResolvedValue(product),
      availability: jest.fn().mockResolvedValue({
        variants: [{ variant_id: 'variant-1', available_qty: 2 }],
      }),
    };
    const service = new CartService(prisma as never, products as never);

    await expect(
      service.add('user-1', {
        product_id: 'product-1',
        variant_id: 'variant-1',
        quantity: 3,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.cartItem.create).not.toHaveBeenCalled();
  });

  it('scopes deletion to the authenticated owner', async () => {
    const prisma = {
      cartItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const service = new CartService(prisma as never, {} as never);

    await expect(service.remove('user-1', 'item-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'item-1', cart: { user_id: 'user-1' } },
    });
  });
});
