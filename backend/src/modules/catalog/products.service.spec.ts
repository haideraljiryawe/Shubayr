jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../media/media.service', () => ({ MediaService: class {} }));

import { ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service';

const product = {
  id: 'product-id',
  category_id: 'category-id',
  name_en: 'Coffee',
  name_ar: 'Ù‚Ù‡ÙˆØ©',
  description: null,
  price: '20150',
  discount_type: 'percentage',
  discount_value: '50',
  discount_starts_at: new Date('2020-01-01T00:00:00Z'),
  discount_ends_at: new Date('2030-01-01T00:00:00Z'),
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
  it('pages and filters the admin catalog in SQL, including SKU and barcode search', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ total: 10_000n }])
      .mockResolvedValueOnce([{ id: 'product-page-id' }]);
    const prisma = {
      storeSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      $queryRaw: queryRaw,
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
      product: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ProductsService(
      prisma as never,
      {} as never,
      {} as never,
    );
    const result = await service.listAdmin({
      q: 'SKU-9000',
      status: ['hidden'],
      availability: ['out_of_stock'],
      has_image: false,
      page: 4,
      per_page: 25,
      sort: 'sku_desc',
    });
    const sql = queryRaw.mock.calls
      .map(([statement]) =>
        (statement as { strings: string[] }).strings.join('?'),
      )
      .join('\n');
    expect(sql).toContain('search_variant.sku ILIKE');
    expect(sql).toContain('search_variant.barcode ILIKE');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM product_images');
    expect(sql).toContain("COALESCE(pa.availability, 'out_of_stock')");
    expect(sql).toContain('MIN(v.sku)');
    expect(sql).toContain('DESC NULLS LAST');
    expect(result).toMatchObject({ page: 4, per_page: 25, total: 10_000 });
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['product-page-id'] } } }),
    );
  });

  it('excludes archived products by default in the SQL-paginated admin list', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ total: 0n }])
      .mockResolvedValueOnce([]);
    const service = new ProductsService(
      {
        storeSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        $queryRaw: queryRaw,
        $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
          Promise.all(operations),
        ),
        product: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
      {} as never,
    );

    await service.listAdmin({ page: 1, per_page: 20 });

    const sql = queryRaw.mock.calls
      .map(([statement]) =>
        (statement as { strings: string[] }).strings.join('?'),
      )
      .join('\n');
    expect(sql).toContain('p.status IN');
    const values = queryRaw.mock.calls.flatMap(
      ([statement]) => (statement as { values: unknown[] }).values,
    );
    expect(values).toEqual(expect.arrayContaining(['active', 'hidden']));
    expect(values).not.toContain('archived');
  });

  it('keeps ASCII and SKU searches off the Arabic normalization expression', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ total: 0n }])
      .mockResolvedValueOnce([]);
    const service = new ProductsService(
      {
        storeSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        $queryRaw: queryRaw,
        $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
          Promise.all(operations),
        ),
        product: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
      {} as never,
    );

    await service.listAdmin({ q: 'SKU-100', page: 1, per_page: 20 });

    const sql = queryRaw.mock.calls
      .map(([statement]) =>
        (statement as { strings: string[] }).strings.join('?'),
      )
      .join('\n');
    expect(sql).toContain('p.name_ar ILIKE');
    expect(sql).not.toContain('translate(regexp_replace');
  });

  it('uses search-only normalization for Arabic names', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ total: 0n }])
      .mockResolvedValueOnce([]);
    const service = new ProductsService(
      {
        storeSetting: { findUnique: jest.fn().mockResolvedValue(null) },
        $queryRaw: queryRaw,
        $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
          Promise.all(operations),
        ),
        product: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
      {} as never,
    );

    await service.listAdmin({
      q: '\u0627\u062c\u0647\u0632\u0647',
      page: 1,
      per_page: 20,
    });

    const sql = queryRaw.mock.calls
      .map(([statement]) =>
        (statement as { strings: string[] }).strings.join('?'),
      )
      .join('\n');
    expect(sql).toContain('translate(regexp_replace');
  });

  it('hard-deletes an unreferenced product and clears transient cart/media data', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'product-id',
          status: 'hidden',
          images: [{ url: 'http://api/media/media-id' }],
          _count: {
            purchase_invoice_items: 0,
            inventory_batches: 0,
            order_items: 0,
            product_reviews: 0,
            price_approval_requests: 0,
          },
        }),
        delete: jest.fn(),
      },
      banner: { count: jest.fn().mockResolvedValue(0) },
      productVariant: { findFirst: jest.fn().mockResolvedValue(null) },
      cartItem: { deleteMany: jest.fn() },
      wishlistItem: { deleteMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
      mediaObject: {
        findUnique: jest.fn().mockResolvedValue({ id: 'media-id' }),
      },
    };
    const media = { remove: jest.fn() };
    const audit = { record: jest.fn() };
    const search = { indexProduct: jest.fn() };
    const service = new ProductsService(
      prisma as never,
      media as never,
      audit,
      search as never,
    );

    await expect(
      service.deleteOrArchive('product-id', 'actor-id'),
    ).resolves.toEqual({ outcome: 'deleted', reasons: [] });
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { product_id: 'product-id' },
    });
    expect(tx.product.delete).toHaveBeenCalledWith({
      where: { id: 'product-id' },
    });
    expect(media.remove).toHaveBeenCalledWith('media-id');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'catalog.product.delete_unreferenced',
      }),
    );
  });

  it('keeps a successful hard-delete result when shared media cannot be removed', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'product-id',
          status: 'hidden',
          images: [{ url: 'http://api/media/shared-media' }],
          _count: {
            purchase_invoice_items: 0,
            inventory_batches: 0,
            order_items: 0,
            product_reviews: 0,
            price_approval_requests: 0,
          },
        }),
        delete: jest.fn(),
      },
      banner: { count: jest.fn().mockResolvedValue(0) },
      productVariant: { findFirst: jest.fn().mockResolvedValue(null) },
      cartItem: { deleteMany: jest.fn() },
      wishlistItem: { deleteMany: jest.fn() },
    };
    const media = {
      remove: jest.fn().mockRejectedValue(new ConflictException()),
    };
    const service = new ProductsService(
      {
        $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
          callback(tx),
        ),
        mediaObject: {
          findUnique: jest.fn().mockResolvedValue({ id: 'shared-media' }),
        },
      } as never,
      media as never,
      { record: jest.fn() },
      { indexProduct: jest.fn() } as never,
    );

    await expect(
      service.deleteOrArchive('product-id', 'actor-id'),
    ).resolves.toEqual({ outcome: 'deleted', reasons: [] });
    expect(media.remove).toHaveBeenCalledWith('shared-media');
  });

  it('archives a referenced product and explains every blocking reference', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'product-id',
          status: 'active',
          images: [],
          _count: {
            purchase_invoice_items: 1,
            inventory_batches: 1,
            order_items: 1,
            product_reviews: 0,
            price_approval_requests: 0,
          },
        }),
        update: jest.fn(),
      },
      banner: { count: jest.fn().mockResolvedValue(0) },
      productVariant: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const audit = { record: jest.fn() };
    const service = new ProductsService(
      {
        $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
          work(tx),
        ),
      } as never,
      {} as never,
      audit,
      { indexProduct: jest.fn() } as never,
    );

    await expect(
      service.deleteOrArchive('product-id', 'actor-id'),
    ).resolves.toEqual({
      outcome: 'archived',
      reasons: ['order_history', 'inventory_history', 'purchase_history'],
    });
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'product-id' },
      data: { status: 'archived', search_sync_required: true },
    });
  });

  it('archives a product with stock-control history even without a current batch', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'product-id',
          status: 'hidden',
          images: [],
          _count: {
            purchase_invoice_items: 0,
            inventory_batches: 0,
            order_items: 0,
            product_reviews: 0,
            price_approval_requests: 0,
          },
        }),
        update: jest.fn(),
      },
      banner: { count: jest.fn().mockResolvedValue(0) },
      productVariant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'variant-id' }),
      },
    };
    const service = new ProductsService(
      {
        $transaction: jest.fn((work: (client: typeof tx) => unknown) =>
          work(tx),
        ),
      } as never,
      {} as never,
      { record: jest.fn() },
      { indexProduct: jest.fn() } as never,
    );

    await expect(
      service.deleteOrArchive('product-id', 'actor-id'),
    ).resolves.toEqual({
      outcome: 'archived',
      reasons: ['inventory_history'],
    });
  });

  it('applies a bulk change once and reports an unpublishable id separately', async () => {
    const rows = [
      {
        id: 'ready',
        status: 'hidden',
        category_id: 'category',
        brand_id: null,
        price_approved_at: new Date(),
        variants: [
          {
            pricing_mode: 'fixed',
            price_approved_at: new Date(),
            published_price: null,
          },
        ],
      },
      {
        id: 'not-ready',
        status: 'hidden',
        category_id: 'category',
        brand_id: null,
        price_approved_at: null,
        variants: [],
      },
    ];
    const tx = {
      product: {
        findMany: jest.fn().mockResolvedValue(rows),
        update: jest.fn(),
      },
    };
    const operations = {
      execute: jest.fn((input: { work(client: typeof tx): Promise<unknown> }) =>
        input.work(tx),
      ),
    };
    const audit = { record: jest.fn() };
    const service = new ProductsService(
      {} as never,
      {} as never,
      audit,
      undefined,
      undefined,
      undefined,
      operations as never,
    );
    const result = await service.bulk(
      {
        operation_id: 'bulk-operation-1',
        ids: ['ready', 'not-ready'],
        action: 'publish',
      },
      'actor',
    );
    expect(tx.product.update).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(result.results).toEqual([
      { id: 'ready', status: 'updated' },
      expect.objectContaining({
        id: 'not-ready',
        status: 'error',
        code: 'PRODUCT_NOT_READY',
      }),
    ]);
  });

  it('subtracts lot reservations from sellable stock', async () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: product.id,
          status: 'active',
          category_id: product.category_id,
          variants: [
            {
              id: 'variant-id',
              sku: 'SKU-1',
              low_stock_threshold: null,
              base_unit: 'piece',
              whole_units_only: true,
            },
          ],
        }),
      },
      batchStock: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { quantity: 5, reserved: 3, batch: { variant_id: 'variant-id' } },
          ]),
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
    expect(result.effective_price).toBe(10075);
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
    expect(updateData).toEqual({
      name_en: 'Fresh Coffee',
      search_sync_required: true,
    });
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
