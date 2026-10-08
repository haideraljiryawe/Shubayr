jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../catalog/products.service', () => ({ ProductsService: class {} }));

import { ConflictException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';

const product = {
  id: 'product-1',
  category_id: 'category-1',
  price: '20150',
  discount_type: 'percentage',
  discount_value: '50',
  discount_starts_at: new Date('2020-01-01'),
  discount_ends_at: new Date('2030-01-01'),
  variants: [{ id: 'variant-1', price_delta: 0 }],
};

describe('CartService', () => {
  function repeatSafeCartService() {
    let line:
      | {
          id: string;
          quantity: number;
        }
      | undefined;
    const mutations = new Map<string, { kind: string; fingerprint: string }>();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      cart: { update: jest.fn().mockResolvedValue({}) },
      cartItem: {
        findFirst: jest.fn(() => Promise.resolve(line)),
        create: jest.fn(({ data }: { data: { quantity: number } }) =>
          Promise.resolve((line = { id: 'item-1', quantity: data.quantity })),
        ),
        update: jest.fn(({ data }: { data: { quantity: number } }) =>
          Promise.resolve((line = { id: 'item-1', quantity: data.quantity })),
        ),
      },
      cartMutation: {
        findUnique: jest.fn(
          ({
            where,
          }: {
            where: {
              cart_id_idempotency_key: { idempotency_key: string };
            };
          }) =>
            Promise.resolve(
              mutations.get(where.cart_id_idempotency_key.idempotency_key) ??
                null,
            ),
        ),
        create: jest.fn(
          ({
            data,
          }: {
            data: {
              idempotency_key: string;
              kind: string;
              fingerprint: string;
            };
          }) => {
            mutations.set(data.idempotency_key, data);
            return Promise.resolve(data);
          },
        ),
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
        variants: [{ variant_id: 'variant-1', available_qty: 20 }],
      }),
    };
    const service = new CartService(prisma as never, products as never);
    jest
      .spyOn(
        service as unknown as {
          response: (id: string) => Promise<{ quantity: number | undefined }>;
        },
        'response',
      )
      .mockImplementation(() => Promise.resolve({ quantity: line?.quantity }));
    return { service, tx, line: () => line };
  }

  it('does not add a line twice when an add idempotency key is replayed', async () => {
    const { service, tx, line } = repeatSafeCartService();
    const input = {
      product_id: 'product-1',
      variant_id: 'variant-1',
      quantity: 2,
    };

    await service.add('user-1', input, 'add-key-0001');
    await service.add('user-1', input, 'add-key-0001');

    expect(line()?.quantity).toBe(2);
    expect(tx.cartItem.create).toHaveBeenCalledTimes(1);
    expect(tx.cartItem.update).not.toHaveBeenCalled();
    expect(tx.cartMutation.create).toHaveBeenCalledTimes(1);
  });

  it('makes a replayed guest-basket merge a no-op', async () => {
    const { service, tx, line } = repeatSafeCartService();
    const input = {
      items: [
        {
          product_id: 'product-1',
          variant_id: 'variant-1',
          quantity: 3,
        },
      ],
    };

    await service.merge('user-1', input, 'merge-key-0001');
    await service.merge('user-1', input, 'merge-key-0001');

    expect(line()?.quantity).toBe(3);
    expect(tx.cartItem.create).toHaveBeenCalledTimes(1);
    expect(tx.cartItem.update).not.toHaveBeenCalled();
    expect(tx.cartMutation.create).toHaveBeenCalledTimes(1);
  });

  it('rejects reusing a cart idempotency key for a different change', async () => {
    const { service } = repeatSafeCartService();
    await service.add(
      'user-1',
      {
        product_id: 'product-1',
        variant_id: 'variant-1',
        quantity: 1,
      },
      'shared-key-0001',
    );

    await expect(
      service.add(
        'user-1',
        {
          product_id: 'product-1',
          variant_id: 'variant-1',
          quantity: 2,
        },
        'shared-key-0001',
      ),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('keeps the seen price while exposing the current price for explicit acceptance', async () => {
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
              unit_price: '999999',
              price_version: 'seen-v1',
              currency_code: 'IQD',
              product,
              variant: { pricing_mode: 'fixed', selling_price: '20250' },
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
      currency: 'IQD',
      items: [
        {
          id: 'item-1',
          product_id: 'product-1',
          variant_id: 'variant-1',
          quantity: 2,
          unit_price: 999999,
          price_version: 'seen-v1',
          current_unit_price: 10125,
          current_price_version: 'legacy:0:10125',
          price_changed: true,
          line_total: 1999998,
          currency: 'IQD',
          available_qty: 4,
          available: true,
        },
      ],
      subtotal: 20250,
      discount: 0,
      delivery_fee: 0,
      total: 20250,
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

  it('applies a coupon, removes it, and restores the original total', async () => {
    const coupon = {
      id: 'coupon-1',
      code: 'SHUBAYR10',
      type: 'percentage',
      value: '10',
      usage_limit: null,
      used_count: 0,
      expires_at: null,
      currency_code: 'IQD',
    };
    let applied = false;
    const prisma = {
      coupon: { findFirst: jest.fn().mockResolvedValue(coupon) },
      cart: {
        upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }),
        update: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: { coupon_id: string | null } }) => {
              applied = data.coupon_id !== null;
              return Promise.resolve({ id: 'cart-1' });
            },
          ),
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'cart-1',
            coupon: applied ? coupon : null,
            items: [
              {
                id: 'item-1',
                product_id: 'product-1',
                variant_id: 'variant-1',
                quantity: 2,
                unit_price: '999999',
                product,
                variant: { pricing_mode: 'fixed', selling_price: '20250' },
              },
            ],
          }),
        ),
      },
    };
    const products = {
      availability: jest.fn().mockResolvedValue({
        variants: [{ variant_id: 'variant-1', available_qty: 4 }],
      }),
    };
    const service = new CartService(prisma as never, products as never);
    const original = await service.get('user-1');
    await service.applyCoupon('user-1', { code: 'SHUBAYR10' });
    const discounted = await service.get('user-1');
    expect(discounted.coupon_code).toBe('SHUBAYR10');
    expect(discounted.discount).toBe(2025);
    expect(discounted.total).toBe(18225);

    const restored = await service.removeCoupon('user-1');
    expect(restored.coupon_code).toBeNull();
    expect(restored.discount).toBe(0);
    expect(restored.total).toBe(original.total);
    expect(prisma.cart.update).toHaveBeenCalledTimes(2);
    expect(applied).toBe(false);
  });
});
