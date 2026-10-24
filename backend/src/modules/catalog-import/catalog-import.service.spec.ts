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
  applied_count: 0,
  commit_batches_done: 0,
  commit_batches_total: 0,
  commit_attempt: 0,
  preview,
  error_report_key: preview ? 'catalog/report.csv' : null,
  operation_id: null,
  opening_id: null,
  created_by: actor.id,
  committed_by: null,
  created_at: new Date('2026-10-13T00:00:00Z'),
  updated_at: new Date('2026-10-13T00:00:00Z'),
  completed_at: null,
  creator: {
    id: actor.id,
    name: 'Catalog Admin',
    username: 'catalog.admin',
    phone: null,
  },
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
    queue: { add: jest.fn(), getJob: jest.fn().mockResolvedValue(undefined) },
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
  it('requeues an interrupted commit with its durable attempt on worker startup', async () => {
    const prisma = {
      catalogImport: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: '00000000-0000-4000-8000-000000000010', commit_attempt: 3 },
          ]),
      },
    };
    const deps = dependencies(prisma);
    await service(deps).resumeInterrupted();
    expect(deps.queue.add).toHaveBeenCalledWith(
      'commit',
      {
        importId: '00000000-0000-4000-8000-000000000010',
        commitAttempt: 3,
      },
      expect.objectContaining({
        jobId: 'commit-00000000-0000-4000-8000-000000000010-3',
      }),
    );
  });

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
    const arabicName = 'منتجات-جديدة.xlsx';
    const result = await service(deps).preview(
      {
        buffer: workbook,
        size: workbook.length,
        originalname: Buffer.from(arabicName, 'utf8').toString('latin1'),
      },
      true,
      actor,
    );
    expect(result.status).toBe('ready');
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.inventoryOpening.create).not.toHaveBeenCalled();
    expect(deps.storage.put).toHaveBeenCalledTimes(2); // source + CSV report
    const createCalls = prisma.catalogImport.create.mock
      .calls as unknown as Array<[{ data: { file_name: string } }]>;
    expect(createCalls[0][0].data.file_name).toBe(arabicName);
    const storageCalls = deps.storage.put.mock.calls as unknown as Array<
      [string, Buffer, string]
    >;
    const report = storageCalls[1][1];
    expect([...report.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
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

  it('queues one deterministic background commit when an operation is submitted twice', async () => {
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
    const committing = {
      ...record,
      status: 'committing',
      progress: 0,
      operation_id: 'operation-import-1',
      committed_by: actor.id,
      commit_attempt: 1,
    };
    let current: Record<string, unknown> = record;
    const tx = {
      $queryRaw: jest.fn(),
      catalogImport: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockImplementation(() => current),
        update: jest.fn().mockImplementation(() => {
          current = committing;
          return committing;
        }),
      },
    };
    const prisma = {
      catalogImport: {
        findUnique: jest.fn().mockImplementation(() => current),
        updateMany: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
    };
    const deps = dependencies(prisma);
    const instance = service(deps);
    const first = await instance.commit(record.id, 'operation-import-1', actor);
    const replay = await instance.commit(
      record.id,
      'operation-import-1',
      actor,
    );
    expect(replay).toEqual(first);
    expect(tx.catalogImport.update).toHaveBeenCalledTimes(1);
    expect(deps.queue.add).toHaveBeenCalledTimes(2);
    expect(deps.queue.add).toHaveBeenLastCalledWith(
      'commit',
      { importId: record.id, commitAttempt: 1 },
      expect.objectContaining({ jobId: `commit-${record.id}-1` }),
    );
    expect(first).toMatchObject({
      opening_id: null,
      status: 'committing',
      applied_rows: 0,
      total_rows: 2,
      commit_batches_done: 0,
      commit_batches_total: 2,
    });
  });

  it('reports completed commit batches separately from applied rows', () => {
    const instance = service(dependencies({}));
    const product = {
      sheet: 'Products+Variants' as const,
      row: 2,
      sku: 'SKU-1',
      action: 'create' as const,
      apply_action: 'create' as const,
      issues: [],
      product: {} as ParsedProductRow,
    };
    const preview: ImportPreview = {
      rows: [
        ...Array.from({ length: 251 }, (_, index) => ({
          ...product,
          row: index + 2,
          sku: `SKU-${index}`,
        })),
        {
          sheet: 'Stock',
          row: 2,
          sku: 'SKU-1',
          action: 'create',
          apply_action: 'create',
          issues: [],
          stock: {
            sheet: 'Stock',
            row: 2,
            sku: 'SKU-1',
            location_code: 'MAIN',
            quantity: '1',
            unit_cost_iqd: '1',
            expiry: null,
          },
        },
      ],
      counts: {
        total: 252,
        create: 252,
        update: 0,
        error: 0,
        warning: 0,
      },
    };
    const progress = (
      instance as unknown as {
        commitBatchProgress(
          value: ImportPreview,
          applied: number,
          status: string,
        ): { commit_batches_done: number; commit_batches_total: number };
      }
    ).commitBatchProgress(preview, 250, 'committing');
    expect(progress).toEqual({
      commit_batches_done: 1,
      commit_batches_total: 3,
    });
  });

  it('keeps preview rows out of history and includes the creator display name', async () => {
    const record = importRecord({
      rows: [],
      counts: { total: 0, create: 0, update: 0, error: 0, warning: 0 },
    });
    const {
      preview: _preview,
      source_object_key: _objectKey,
      source_checksum: _checksum,
      ...summary
    } = record;
    void _preview;
    void _objectKey;
    void _checksum;
    const prisma = {
      catalogImport: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([summary]),
      },
      $transaction: jest
        .fn()
        .mockImplementation((operations: Array<Promise<unknown>>) =>
          Promise.all(operations),
        ),
    };
    const result = await service(dependencies(prisma)).list();
    expect(result.data[0]).toMatchObject({
      created_by_name: 'Catalog Admin',
      row_count: 0,
    });
    expect(result.data[0]).not.toHaveProperty('preview');
    const [options] = prisma.catalogImport.findMany.mock
      .calls[0] as unknown as [{ select: Record<string, unknown> }];
    expect(options.select).not.toHaveProperty('preview');
  });

  it('returns lightweight poll progress without loading or returning preview rows', async () => {
    const prisma = {
      catalogImport: {
        findUnique: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000010',
          status: 'failed',
          commit_batches_done: 2,
          commit_batches_total: 3,
          applied_count: 500,
        }),
      },
      catalogImportRowResult: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue({
          sheet: 'Products+Variants',
          row_number: 502,
          error_code: 'CATALOG_IMPORT_UNIQUE_CONFLICT',
          error_message: 'Barcode already exists',
        }),
      },
    };
    const result = await service(dependencies(prisma)).progress(
      '00000000-0000-4000-8000-000000000010',
    );
    expect(result).toEqual({
      id: '00000000-0000-4000-8000-000000000010',
      status: 'failed',
      batches_done: 2,
      batches_total: 3,
      rows_applied: 500,
      rows_failed: 1,
      last_error: {
        code: 'CATALOG_IMPORT_UNIQUE_CONFLICT',
        message: 'Barcode already exists',
        sheet: 'Products+Variants',
        row_number: 502,
      },
    });
    expect(result).not.toHaveProperty('preview');
    expect(result).not.toHaveProperty('rows');
    const [query] = prisma.catalogImport.findUnique.mock
      .calls[0] as unknown as [{ select: Record<string, unknown> }];
    expect(query.select).not.toHaveProperty('preview');
  });

  it('attaches matched ZIP images in order and reports unmatched files', async () => {
    const zip = new JSZip();
    zip.file('SKU-1.jpg', Buffer.from('one'));
    zip.file('SKU-1-2.png', Buffer.from('two'));
    zip.file('UNKNOWN.jpg', Buffer.from('three'));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const tx = {
      productVariant: {
        findMany: jest.fn().mockResolvedValue([
          {
            sku: 'SKU-1',
            product_id: 'product-1',
            product: { name_ar: 'منتج', name_en: 'Product' },
          },
        ]),
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
    expect(result.failed).toEqual([]);
    expect(result.matched[0]).toMatchObject({
      product_name_ar: 'منتج',
      product_name_en: 'Product',
    });
    expect(tx.productImage.create).toHaveBeenCalledTimes(2);
  });

  it('reports a corrupt matched ZIP image without attaching the original', async () => {
    const zip = new JSZip();
    zip.file('SKU-1.jpg', Buffer.from('not-an-image'));
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const tx = {
      productVariant: {
        findMany: jest.fn().mockResolvedValue([
          {
            sku: 'SKU-1',
            product_id: 'product-1',
            product: { name_ar: 'Product AR', name_en: 'Product' },
          },
        ]),
      },
      productImage: {
        aggregate: jest.fn(),
        create: jest.fn(),
      },
    };
    const deps = dependencies({});
    deps.operations.execute.mockImplementation(
      (input: { work(client: typeof tx): Promise<unknown> }) => input.work(tx),
    );
    deps.media.uploadCatalogImage.mockRejectedValue(
      new Error('decoder details stay internal'),
    );

    const result = await service(deps).bulkImages(
      { buffer, size: buffer.length, originalname: 'images.zip' },
      'operation-images-failed',
      actor,
    );

    expect(result.matched).toEqual([]);
    expect(result.failed).toEqual([
      {
        file: 'SKU-1.jpg',
        code: 'CATALOG_IMAGE_PROCESSING_FAILED',
        message:
          'The image could not be decoded and stored as a square catalog image',
      },
    ]);
    expect(tx.productImage.create).not.toHaveBeenCalled();
  });
});
