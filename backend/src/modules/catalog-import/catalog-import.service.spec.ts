jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../media/object-storage.service', () => ({
  ObjectStorageService: class {},
}));
jest.mock('../media/media.service', () => ({ MediaService: class {} }));
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

import JSZip from 'jszip';
import { buildTemplate } from './catalog-import.xlsx';
import { CatalogImportService } from './catalog-import.service';
import type { ImportPreview, ParsedProductRow } from './catalog-import.types';

const actor = {
  id: '00000000-0000-4000-8000-000000000001',
  permissions: ['catalog.import', 'inventory.manage', 'cost.view'],
};

const importRecord = (preview: ImportPreview | null = null) => ({
  id: '00000000-0000-4000-8000-000000000010',
  file_name: 'catalog.xlsx',
  source_object_key: 'catalog/source.xlsx',
  source_checksum: 'a'.repeat(64),
  create_missing: true,
  status: preview ? 'ready' : 'validating',
  progress: preview ? 100 : 10,
  row_count: preview?.counts.total ?? 3,
  create_count: preview?.counts.create ?? 0,
  update_count: preview?.counts.update ?? 0,
  error_count: preview?.counts.error ?? 0,
  warning_count: preview?.counts.warning ?? 0,
  preview,
  error_report_key: preview ? 'catalog/report.csv' : null,
  operation_id: null,
  opening_id: null,
  created_by: actor.id,
  committed_by: null,
  created_at: new Date('2026-10-13T00:00:00Z'),
  updated_at: new Date('2026-10-13T00:00:00Z'),
  completed_at: null,
});

function dependencies(prisma: Record<string, unknown>) {
  return {
    prisma,
    storage: {
      put: jest.fn(),
      get: jest.fn(),
      remove: jest.fn(),
    },
    media: { uploadCatalogImage: jest.fn() },
    operations: { execute: jest.fn() },
    inventory: { createOpeningInTransaction: jest.fn() },
    audit: { record: jest.fn() },
    queue: { add: jest.fn() },
  };
}

function service(deps: ReturnType<typeof dependencies>) {
  return new CatalogImportService(
    deps.prisma as never,
    deps.storage as never,
    deps.media as never,
    deps.operations as never,
    deps.inventory as never,
    deps.audit,
    deps.queue as never,
  );
}

describe('CatalogImportService', () => {
  it('previews valid and mixed files without writing catalog or inventory rows', async () => {
    const workbook = await buildTemplate();
    const record = importRecord();
    const ready = { ...record, status: 'ready', progress: 100 };
    const prisma = {
      catalogImport: {
        create: jest.fn().mockResolvedValue(record),
        findUnique: jest.fn().mockResolvedValue(record),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: object }) =>
            Promise.resolve({ ...ready, ...data }),
          ),
      },
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findMany: jest.fn().mockResolvedValue([]) },
      warehouseLocation: {
        findMany: jest.fn().mockResolvedValue([{ code: 'MAIN' }]),
      },
      currency: { findMany: jest.fn().mockResolvedValue([{ code: 'USD' }]) },
      product: { create: jest.fn() },
      inventoryOpening: { create: jest.fn() },
    };
    const deps = dependencies(prisma);
    deps.storage.get.mockResolvedValue(workbook);
    const result = await service(deps).preview(
      { buffer: workbook, size: workbook.length, originalname: 'catalog.xlsx' },
      true,
      actor,
    );
    expect(result.status).toBe('ready');
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.inventoryOpening.create).not.toHaveBeenCalled();
    expect(deps.storage.put).toHaveBeenCalledTimes(2); // source + CSV report
  });

  it('classifies SKU updates and refuses missing taxonomy unless create-missing is selected', async () => {
    const prisma = {
      productVariant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'v1', sku: 'SKU-1', barcode: null }]),
      },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      brand: { findMany: jest.fn().mockResolvedValue([]) },
      warehouseLocation: { findMany: jest.fn().mockResolvedValue([]) },
      currency: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const instance = service(dependencies(prisma));
    const row: ParsedProductRow = {
      sheet: 'Products+Variants',
      row: 2,
      category_level_1: 'Root',
      category_level_2: 'Leaf',
      brand: null,
      product_name_ar: 'منتج',
      product_name_en: 'Product',
      description_ar: null,
      description_en: null,
      sku: 'SKU-1',
      attributes: {},
      base_unit: 'piece',
      whole_units_only: true,
      price_iqd: 1000,
      reference_currency_code: null,
      reference_price: null,
      low_stock_threshold: null,
      barcode: null,
      status: 'hidden',
      image_urls: [],
    };
    const build = (
      instance as unknown as {
        buildPreview(
          products: Array<{ row: ParsedProductRow; issues: [] }>,
          stocks: [],
          createMissing: boolean,
        ): Promise<ImportPreview>;
      }
    ).buildPreview.bind(instance);
    const refused = await build([{ row, issues: [] }], [], false);
    expect(refused.rows[0]).toMatchObject({
      action: 'error',
      apply_action: null,
    });
    expect(refused.rows[0].issues[0]).toMatchObject({
      code: 'CATEGORY_NOT_FOUND',
      cell: 'Products+Variants!A2',
    });
    const allowed = await build([{ row, issues: [] }], [], true);
    expect(allowed.rows[0]).toMatchObject({
      action: 'update',
      apply_action: 'update',
    });
  });

  it('commits product and Stock rows once when an operation is submitted twice', async () => {
    const product: ParsedProductRow = {
      sheet: 'Products+Variants',
      row: 2,
      category_level_1: 'Root',
      category_level_2: 'Leaf',
      brand: null,
      product_name_ar: 'منتج',
      product_name_en: 'Product',
      description_ar: null,
      description_en: null,
      sku: 'SKU-NEW',
      attributes: {},
      base_unit: 'piece',
      whole_units_only: true,
      price_iqd: 1000,
      reference_currency_code: null,
      reference_price: null,
      low_stock_threshold: 2,
      barcode: null,
      status: 'hidden',
      image_urls: [],
    };
    const preview: ImportPreview = {
      rows: [
        {
          sheet: 'Products+Variants',
          row: 2,
          sku: product.sku,
          action: 'create',
          apply_action: 'create',
          issues: [],
          product,
        },
        {
          sheet: 'Stock',
          row: 2,
          sku: product.sku,
          action: 'create',
          apply_action: 'create',
          issues: [],
          stock: {
            sheet: 'Stock',
            row: 2,
            sku: product.sku,
            location_code: 'MAIN',
            quantity: '3',
            unit_cost_iqd: '500',
            expiry: null,
          },
        },
      ],
      counts: { total: 2, create: 2, update: 0, error: 0, warning: 0 },
    };
    const record = importRecord(preview);
    const root = {
      id: 'root',
      parent_id: null,
      name_en: 'Root',
      name_ar: 'Root',
    };
    const leaf = {
      id: 'leaf',
      parent_id: 'root',
      name_en: 'Leaf',
      name_ar: 'Leaf',
    };
    const tx = {
      $queryRaw: jest.fn(),
      catalogImport: {
        findUnique: jest.fn().mockResolvedValue(record),
        update: jest.fn(),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([root, leaf]),
        create: jest.fn(),
      },
      brand: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      product: {
        create: jest.fn().mockResolvedValue({ id: 'product-1' }),
        update: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'variant-1' }),
        update: jest.fn(),
      },
      warehouseLocation: {
        findMany: jest.fn().mockResolvedValue([{ id: 'location-1' }]),
      },
      productImage: { aggregate: jest.fn(), create: jest.fn() },
    };
    const prisma = {
      catalogImport: { findUnique: jest.fn().mockResolvedValue(record) },
    };
    const deps = dependencies(prisma);
    const cache = new Map<string, unknown>();
    deps.operations.execute.mockImplementation(
      async (input: {
        operationId: string;
        work(client: typeof tx): Promise<unknown>;
      }) => {
        if (cache.has(input.operationId)) return cache.get(input.operationId);
        const value = await input.work(tx);
        cache.set(input.operationId, value);
        return value;
      },
    );
    deps.inventory.createOpeningInTransaction.mockResolvedValue({
      id: 'opening-1',
    });
    const instance = service(deps);
    const first = await instance.commit(record.id, 'operation-import-1', actor);
    const replay = await instance.commit(
      record.id,
      'operation-import-1',
      actor,
    );
    expect(replay).toEqual(first);
    expect(tx.product.create).toHaveBeenCalledTimes(1);
    expect(tx.productVariant.create).toHaveBeenCalledTimes(1);
    expect(deps.inventory.createOpeningInTransaction).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      opening_id: 'opening-1',
      status: 'completed',
    });
  });

  it('attaches matched ZIP images in order and reports unmatched files', async () => {
    const zip = new JSZip();
    zip.file('SKU-1.jpg', Buffer.from('one'));
    zip.file('SKU-1-2.png', Buffer.from('two'));
    zip.file('UNKNOWN.jpg', Buffer.from('three'));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const tx = {
      productVariant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ sku: 'SKU-1', product_id: 'product-1' }]),
      },
      productImage: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sort_order: 0 } }),
        create: jest.fn(),
      },
    };
    const deps = dependencies({});
    deps.operations.execute.mockImplementation(
      (input: { work(client: typeof tx): Promise<unknown> }) => input.work(tx),
    );
    deps.media.uploadCatalogImage
      .mockResolvedValueOnce({ public_url: 'http://api/media/1' })
      .mockResolvedValueOnce({ public_url: 'http://api/media/2' });
    const result = await service(deps).bulkImages(
      { buffer, size: buffer.length, originalname: 'images.zip' },
      'operation-images-1',
      actor,
    );
    expect(result.matched.map((item) => item.file)).toEqual([
      'SKU-1-2.png',
      'SKU-1.jpg',
    ]);
    expect(result.unmatched).toEqual(['UNKNOWN.jpg']);
    expect(tx.productImage.create).toHaveBeenCalledTimes(2);
  });
});
