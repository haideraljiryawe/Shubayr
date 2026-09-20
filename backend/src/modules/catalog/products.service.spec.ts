jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../media/media.service', () => ({ MediaService: class {} }));

import { ProductsService } from './products.service';
import { UnprocessableEntityException } from '@nestjs/common';

const product = {
  id: 'product-id',
  category_id: 'category-id',
  name_en: 'Coffee',
  name_ar: 'Ù‚Ù‡ÙˆØ©',
  description: null,
  price: '20.15',
  discount_type: 'percentage',
  discount_value: '50',
  discount_starts_at: new Date('2020-01-01T00:00:00Z'),
  discount_ends_at: new Date('2030-01-01T00:00:00Z'),
  is_negotiable: false,
  floor_price: null,
  points_price: null,
  tracks_expiry: false,
  rating_avg: '4.50',
  status: 'active',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  category: { id: 'category-id' },
  images: [
    {
      id: 'image-a',
      product_id: 'product-id',
      url: 'http://api/media/a',
      sort_order: 0,
    },
    {
      id: 'image-b',
      product_id: 'product-id',
      url: 'http://api/media/b',
      sort_order: 1,
    },
  ],
  variants: [],
};

function availabilityMocks() {
  return {
    batchStock: { findMany: jest.fn().mockResolvedValue([]) },
    stockReservation: { findMany: jest.fn().mockResolvedValue([]) },
    simpleStockHold: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('ProductsService', () => {
  it('rejects an updated negotiation floor above the stored regular price before SQL', async () => {
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      $transaction: jest.fn(),
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.update(product.id, { floor_price: 20.16 }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('subtracts active COD holds as well as batch reservations from sellable stock', async () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: product.id,
          status: 'active',
          category_id: product.category_id,
          variants: [],
        }),
      },
      batchStock: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ quantity: 5, batch: { variant_id: null } }]),
      },
      stockReservation: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ quantity: 1, batch: { variant_id: null } }]),
      },
      simpleStockHold: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ quantity: 2, variant_id: null }]),
      },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const availability = await service.availability(product.id);
    expect(availability.available_qty).toBe(2);
    expect(availability.variants[0].available_qty).toBe(2);
  });

  it('filters public queries to categories with fully visible ancestry', async () => {
    let productQuery: unknown;
    const prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'hidden', parent_id: null, is_visible: false },
          { id: 'child', parent_id: 'hidden', is_visible: true },
          { id: 'public', parent_id: null, is_visible: true },
        ]),
      },
      product: {
        findMany: jest.fn((query: unknown) => {
          productQuery = query;
          return Promise.resolve([]);
        }),
      },
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await service.listPublic({});
    const query = productQuery as {
      where: { status: string; category_id: { in: string[] } };
    };
    expect(query.where.status).toBe('active');
    expect(query.where.category_id.in).toEqual(['public']);
  });

  it('computes server-time effective pricing and primary image on reads', async () => {
    const availability = availabilityMocks();
    const prisma = {
      product: {
        findUnique: jest.fn((query: { select?: unknown }) =>
          Promise.resolve(
            query.select ? { id: product.id, variants: [] } : product,
          ),
        ),
      },
      ...availability,
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const result = await service.getAdmin(product.id);
    expect(result.effective_price).toBe(10.08);
    expect(result.on_sale).toBe(true);
    expect(result.images.map(({ is_primary }) => is_primary)).toEqual([
      true,
      false,
    ]);
  });

  it('does not rewrite a scheduled discount when editing a name', async () => {
    let updateData: unknown;
    const tx = {
      product: {
        update: jest.fn((query: { data: unknown }) => {
          updateData = query.data;
          return Promise.resolve(product);
        }),
      },
    };
    const availability = availabilityMocks();
    const prisma = {
      product: {
        findUnique: jest.fn((query: { select?: unknown }) =>
          Promise.resolve(
            query.select ? { id: product.id, variants: [] } : product,
          ),
        ),
      },
      ...availability,
      $transaction: jest.fn((operation: unknown) =>
        typeof operation === 'function'
          ? (operation as (client: typeof tx) => Promise<unknown>)(tx)
          : Promise.all(operation as Array<Promise<unknown>>),
      ),
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await service.update(product.id, { name_en: 'Fresh Coffee' });
    expect(updateData).toEqual({ name_en: 'Fresh Coffee' });
  });

  it('applies remove and move media operations with contiguous order', async () => {
    const updates: Array<{ id: string; sort_order: number }> = [];
    const tx = {
      product: { update: jest.fn().mockResolvedValue(product) },
      productImage: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(
          (query: { where: { id: string }; data: { sort_order: number } }) => {
            updates.push({
              id: query.where.id,
              sort_order: query.data.sort_order,
            });
            return Promise.resolve({});
          },
        ),
        create: jest.fn(),
      },
    };
    const availability = availabilityMocks();
    const prisma = {
      product: {
        findUnique: jest.fn((query: { select?: unknown }) =>
          Promise.resolve(
            query.select ? { id: product.id, variants: [] } : product,
          ),
        ),
      },
      ...availability,
      $transaction: jest.fn((operation: unknown) =>
        typeof operation === 'function'
          ? (operation as (client: typeof tx) => Promise<unknown>)(tx)
          : Promise.all(operation as Array<Promise<unknown>>),
      ),
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await service.update(product.id, {
      media_operations: [{ op: 'remove', image_id: 'image-a' }],
    });
    expect(updates).toEqual([{ id: 'image-b', sort_order: 0 }]);
  });
});
