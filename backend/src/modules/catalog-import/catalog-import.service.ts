import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import JSZip from 'jszip';
import { Prisma } from '../../generated/prisma/client';
import { actorDisplayName, actorSelect } from '../../common/users/actor-name';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OperationService } from '../finance/operation.service';
import { businessDateText } from '../finance/business-date';
import { InventoryService } from '../inventory/inventory.service';
import { MediaService } from '../media/media.service';
import { ObjectStorageService } from '../media/object-storage.service';
import {
  buildTemplate,
  cellRef,
  loadWorkbook,
  parseProducts,
  parseStock,
  productColumns,
  stockColumns,
  workbookRowCount,
} from './catalog-import.xlsx';
import type {
  ImportIssue,
  ImportPreview,
  ImportPreviewRow,
  ParsedProductRow,
} from './catalog-import.types';

const MAX_ROWS = 5_000;
const BACKGROUND_ROWS = 500;
const COMMIT_BATCH_ROWS = 250;
const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const D = (value: string | number | Prisma.Decimal) =>
  new Prisma.Decimal(value);

type Actor = { id: string; permissions: string[] };
const importWithCreator = {
  creator: { select: actorSelect },
} satisfies Prisma.CatalogImportInclude;
type ImportRecord = Prisma.CatalogImportGetPayload<{
  include: typeof importWithCreator;
}>;
type CommitJob = { importId: string; commitAttempt: number };

class CatalogImportRowError extends Error {
  constructor(
    readonly row: ImportPreviewRow | undefined,
    readonly original: unknown,
  ) {
    super('Catalog import row failed');
  }
}
export type CatalogUpload = {
  buffer: Buffer;
  size: number;
  originalname: string;
};

function column(columns: readonly (readonly [string, string])[], key: string) {
  return columns.findIndex(([candidate]) => candidate === key) + 1;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('en');
}

function names(value: string) {
  const pieces = value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  if (pieces.length < 2)
    return { en: pieces[0] ?? value.trim(), ar: pieces[0] ?? value.trim() };
  const arabic = pieces.find((item) => /[\u0600-\u06ff]/.test(item));
  const english = pieces.find((item) => item !== arabic);
  return { en: english ?? pieces[0], ar: arabic ?? pieces[1] };
}

function slug(value: string) {
  const ascii = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${ascii || 'catalog'}-${createHash('sha1').update(value).digest('hex').slice(0, 8)}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class CatalogImportService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly media: MediaService,
    private readonly operations: OperationService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    @InjectQueue('catalog-imports') private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    const interrupted = await this.prisma.catalogImport.findMany({
      where: { status: 'committing', operation_id: { not: null } },
      select: { id: true, commit_attempt: true },
    });
    await Promise.all(
      interrupted.map((record) =>
        this.enqueueCommit({
          importId: record.id,
          commitAttempt: record.commit_attempt,
        }),
      ),
    );
  }

  template() {
    return buildTemplate();
  }

  async preview(
    file: CatalogUpload | undefined,
    createMissing: boolean,
    actor: Actor,
  ) {
    if (!file?.buffer?.length) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CATALOG_IMPORT_FILE_REQUIRED',
        message: 'A non-empty .xlsx file is required',
        errors: [],
      });
    }
    if (file.size > MAX_WORKBOOK_BYTES)
      throw new PayloadTooLargeException('Workbook is too large');
    const workbook = await loadWorkbook(file.buffer);
    const rowCount = workbookRowCount(workbook);
    if (rowCount > MAX_ROWS) {
      throw new PayloadTooLargeException({
        status: 413,
        code: 'CATALOG_IMPORT_ROW_LIMIT',
        message: `A catalog import may contain at most ${MAX_ROWS} data rows`,
        errors: [],
      });
    }
    // Parse once up front so malformed headers and unauthorized cost data are
    // rejected synchronously, even when full validation runs in the queue.
    parseProducts(workbook);
    const stock = parseStock(workbook);
    if (
      stock.length &&
      (!actor.permissions.includes('cost.view') ||
        !actor.permissions.includes('inventory.manage'))
    ) {
      throw new ForbiddenException({
        status: 403,
        code: 'CATALOG_IMPORT_STOCK_PERMISSION_REQUIRED',
        message: 'Stock import requires inventory.manage and cost.view',
        errors: [],
      });
    }
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const objectKey = `catalog-imports/${actor.id}/${checksum}.xlsx`;
    await this.storage.put(
      objectKey,
      file.buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    let record;
    try {
      record = await this.prisma.catalogImport.create({
        data: {
          file_name: path.basename(file.originalname || 'catalog.xlsx'),
          source_object_key: objectKey,
          source_checksum: checksum,
          create_missing: createMissing,
          status: rowCount > BACKGROUND_ROWS ? 'queued' : 'validating',
          progress: rowCount > BACKGROUND_ROWS ? 0 : 10,
          row_count: rowCount,
          created_by: actor.id,
        },
        include: importWithCreator,
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
    if (rowCount > BACKGROUND_ROWS) {
      await this.queue.add(
        'validate',
        { importId: record.id },
        { jobId: record.id, removeOnComplete: 100, removeOnFail: 100 },
      );
      return this.present(record, actor.permissions);
    }
    return this.validate(record.id, actor.permissions);
  }

  async validate(importId: string, permissions: string[] = []) {
    const record = await this.require(importId);
    if (record.status === 'completed') return this.present(record, permissions);
    await this.prisma.catalogImport.update({
      where: { id: importId },
      data: { status: 'validating', progress: 15, updated_at: new Date() },
    });
    try {
      const workbook = await loadWorkbook(
        await this.storage.get(record.source_object_key),
      );
      const parsedProducts = parseProducts(workbook);
      const parsedStock = parseStock(workbook);
      const preview = await this.buildPreview(
        parsedProducts,
        parsedStock,
        record.create_missing,
      );
      const report = this.errorReport(preview);
      const reportKey = `catalog-imports/${record.id}/validation.csv`;
      await this.storage.put(
        reportKey,
        Buffer.from(report, 'utf8'),
        'text/csv; charset=utf-8',
      );
      const updated = await this.prisma.catalogImport.update({
        where: { id: importId },
        data: {
          status: 'ready',
          progress: 100,
          preview: json(preview),
          error_report_key: reportKey,
          create_count: preview.counts.create,
          update_count: preview.counts.update,
          error_count: preview.counts.error,
          warning_count: preview.counts.warning,
          updated_at: new Date(),
        },
        include: importWithCreator,
      });
      return this.present(updated, permissions);
    } catch (error) {
      await this.prisma.catalogImport.update({
        where: { id: importId },
        data: { status: 'failed', progress: 100, updated_at: new Date() },
      });
      throw error;
    }
  }

  async list(page = 1, perPage = 20, _permissions: string[] = []) {
    void _permissions;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.catalogImport.count(),
      this.prisma.catalogImport.findMany({
        select: {
          id: true,
          file_name: true,
          create_missing: true,
          status: true,
          progress: true,
          row_count: true,
          create_count: true,
          update_count: true,
          error_count: true,
          warning_count: true,
          applied_count: true,
          commit_attempt: true,
          error_report_key: true,
          operation_id: true,
          opening_id: true,
          created_by: true,
          committed_by: true,
          created_at: true,
          updated_at: true,
          completed_at: true,
          creator: { select: actorSelect },
        },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: data.map((row) => this.presentSummary(row)),
    };
  }

  async get(id: string, permissions: string[]) {
    const record = await this.require(id);
    const results = await this.prisma.catalogImportRowResult.findMany({
      where: { import_id: id },
      select: {
        sheet: true,
        row_number: true,
        status: true,
        error_code: true,
        error_message: true,
      },
    });
    return this.present(record, permissions, results);
  }

  async errorReportFile(id: string) {
    const record = await this.require(id);
    if (!record.error_report_key)
      throw new NotFoundException('Validation report not found');
    return this.storage.get(record.error_report_key);
  }

  async commit(id: string, operationId: string, actor: Actor) {
    const record = await this.require(id);
    if (
      !record.preview ||
      !['ready', 'committing', 'completed', 'failed'].includes(record.status)
    ) {
      throw new ConflictException({
        status: 409,
        code: 'CATALOG_IMPORT_NOT_READY',
        message: 'The import validation preview is not ready',
        errors: [],
      });
    }
    const preview = record.preview as unknown as ImportPreview;
    const applicable = preview.rows.filter(
      (row) =>
        row.apply_action &&
        !row.issues.some((issue) => issue.severity === 'error'),
    );
    if (!applicable.length) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CATALOG_IMPORT_NO_VALID_ROWS',
        message: 'The import contains no valid rows to commit',
        errors: [],
      });
    }
    const stockRows = applicable.filter((row) => row.stock);
    if (
      stockRows.length &&
      (!actor.permissions.includes('cost.view') ||
        !actor.permissions.includes('inventory.manage'))
    ) {
      throw new ForbiddenException({
        status: 403,
        code: 'CATALOG_IMPORT_STOCK_PERMISSION_REQUIRED',
        message: 'Stock import requires inventory.manage and cost.view',
        errors: [],
      });
    }
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'catalog-import-operation:' + operationId}))::text`;
      const reused = await tx.catalogImport.findFirst({
        where: { operation_id: operationId, id: { not: id } },
        select: { id: true },
      });
      if (reused) {
        throw new ConflictException({
          status: 409,
          code: 'CATALOG_IMPORT_OPERATION_ID_REUSED',
          message: 'This operation id belongs to another catalog import',
          errors: [],
        });
      }
      await tx.$queryRaw`SELECT id FROM catalog_imports WHERE id = ${id}::uuid FOR UPDATE`;
      const fresh = await tx.catalogImport.findUnique({
        where: { id },
        include: importWithCreator,
      });
      if (!fresh) throw new NotFoundException('Catalog import not found');
      if (fresh.operation_id && fresh.operation_id !== operationId) {
        throw new ConflictException({
          status: 409,
          code: 'CATALOG_IMPORT_ALREADY_COMMITTED',
          message:
            'This import was already committed with another operation id',
          errors: [],
        });
      }
      if (fresh.status === 'completed' || fresh.status === 'committing')
        return fresh;
      if (!['ready', 'failed'].includes(fresh.status)) {
        throw new ConflictException({
          status: 409,
          code: 'CATALOG_IMPORT_NOT_READY',
          message: 'The import validation preview is not ready',
          errors: [],
        });
      }
      return tx.catalogImport.update({
        where: { id },
        data: {
          status: 'committing',
          operation_id: operationId,
          committed_by: actor.id,
          commit_attempt: { increment: 1 },
          progress: this.commitProgress(fresh.applied_count, applicable.length),
          updated_at: new Date(),
        },
        include: importWithCreator,
      });
    });
    if (claimed.status === 'committing') {
      try {
        await this.enqueueCommit({
          importId: id,
          commitAttempt: claimed.commit_attempt,
        });
      } catch {
        await this.prisma.catalogImport.updateMany({
          where: {
            id,
            status: 'committing',
            commit_attempt: claimed.commit_attempt,
          },
          data: { status: 'failed', updated_at: new Date() },
        });
        throw new ServiceUnavailableException({
          status: 503,
          code: 'CATALOG_IMPORT_QUEUE_UNAVAILABLE',
          message: 'The catalog import worker is unavailable; retry the commit',
          errors: [],
        });
      }
    }
    return this.commitResult(claimed, preview);
  }

  private async enqueueCommit(job: CommitJob) {
    const jobId = `commit-${job.importId}-${job.commitAttempt}`;
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed' || state === 'completed') await existing.remove();
    }
    await this.queue.add('commit', job, {
      jobId,
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  async processCommit(importId: string, commitAttempt: number) {
    const record = await this.require(importId);
    if (
      record.status !== 'committing' ||
      record.commit_attempt !== commitAttempt ||
      !record.preview ||
      !record.operation_id ||
      !record.committed_by
    )
      return;
    const preview = record.preview as unknown as ImportPreview;
    const applicable = preview.rows.filter(
      (row) =>
        row.apply_action &&
        !row.issues.some((issue) => issue.severity === 'error'),
    );
    const productRows = applicable.filter((row) => row.product);
    const stockRows = applicable.filter((row) => row.stock);
    const applied = await this.prisma.catalogImportRowResult.findMany({
      where: { import_id: importId, status: 'applied' },
      select: { sheet: true, row_number: true, result: true },
    });
    const groupedProducts = new Map<string, string>();
    for (const item of applied) {
      if (item.sheet !== 'Products+Variants' || !item.result) continue;
      const result = item.result as { group_key?: string; product_id?: string };
      if (result.group_key && result.product_id)
        groupedProducts.set(result.group_key, result.product_id);
    }
    for (
      let offset = 0;
      offset < productRows.length;
      offset += COMMIT_BATCH_ROWS
    ) {
      const batch = productRows.slice(offset, offset + COMMIT_BATCH_ROWS);
      await this.applyProductBatch(
        record,
        preview,
        batch,
        groupedProducts,
        commitAttempt,
      );
    }
    await this.finishCommit(record, preview, stockRows, commitAttempt);
  }

  private async applyProductBatch(
    record: ImportRecord,
    preview: ImportPreview,
    batch: ImportPreviewRow[],
    groupedProducts: Map<string, string>,
    commitAttempt: number,
  ) {
    let failingRow = batch[0];
    try {
      const committedGroups = await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM catalog_imports WHERE id = ${record.id}::uuid FOR UPDATE`;
          const fresh = await tx.catalogImport.findUnique({
            where: { id: record.id },
            select: {
              status: true,
              commit_attempt: true,
              create_missing: true,
            },
          });
          if (
            !fresh ||
            fresh.status !== 'committing' ||
            fresh.commit_attempt !== commitAttempt
          )
            return new Map(groupedProducts);
          const existing = await tx.catalogImportRowResult.findMany({
            where: {
              import_id: record.id,
              sheet: 'Products+Variants',
              row_number: { in: batch.map((item) => item.row) },
              status: 'applied',
            },
            select: { row_number: true },
          });
          const alreadyApplied = new Set(
            existing.map((item) => item.row_number),
          );
          const localGroups = new Map(groupedProducts);
          for (const item of batch) {
            if (alreadyApplied.has(item.row)) continue;
            failingRow = item;
            const row = item.product!;
            try {
              const ids = await this.resolveTaxonomy(
                tx,
                row,
                fresh.create_missing,
              );
              const existingVariant = await tx.productVariant.findUnique({
                where: { sku: row.sku },
                include: { product: true },
              });
              const price = await this.price(tx, row);
              const groupKey = [
                ids.categoryId,
                ids.brandId ?? '',
                normalize(row.product_name_en),
                normalize(row.product_name_ar),
              ].join('|');
              let productId = existingVariant?.product_id;
              let variantId: string;
              if (!productId) {
                productId = localGroups.get(groupKey);
                if (!productId) {
                  const product = await tx.product.create({
                    data: {
                      category_id: ids.categoryId,
                      brand_id: ids.brandId,
                      name_en: row.product_name_en.trim(),
                      name_ar: row.product_name_ar.trim(),
                      description: row.description_en ?? row.description_ar,
                      description_en: row.description_en,
                      description_ar: row.description_ar,
                      price,
                      status: row.status ?? 'hidden',
                      published_at: row.status === 'active' ? new Date() : null,
                      price_approved_at: new Date(),
                      price_proposed_by: record.committed_by!,
                    },
                  });
                  productId = product.id;
                  localGroups.set(groupKey, productId);
                }
                const variant = await tx.productVariant.create({
                  data: this.variantData(
                    row,
                    productId,
                    price,
                    record.committed_by!,
                  ),
                });
                variantId = variant.id;
              } else {
                await tx.product.update({
                  where: { id: productId },
                  data: {
                    category_id: ids.categoryId,
                    brand_id: ids.brandId,
                    name_en: row.product_name_en.trim(),
                    name_ar: row.product_name_ar.trim(),
                    description: row.description_en ?? row.description_ar,
                    description_en: row.description_en,
                    description_ar: row.description_ar,
                    price,
                    ...(row.status ? { status: row.status } : {}),
                    updated_at: new Date(),
                    search_sync_required: true,
                  },
                });
                const variant = await tx.productVariant.update({
                  where: { id: existingVariant!.id },
                  data: this.variantData(
                    row,
                    productId,
                    price,
                    record.committed_by!,
                  ),
                });
                variantId = variant.id;
                localGroups.set(groupKey, productId);
              }
              if (row.image_urls.length)
                await this.attachRemoteImages(
                  tx,
                  productId,
                  row.image_urls,
                  record.committed_by!,
                );
              await tx.catalogImportRowResult.upsert({
                where: {
                  import_id_sheet_row_number: {
                    import_id: record.id,
                    sheet: item.sheet,
                    row_number: item.row,
                  },
                },
                create: {
                  import_id: record.id,
                  sheet: item.sheet,
                  row_number: item.row,
                  status: 'applied',
                  action: item.apply_action,
                  result: json({
                    sku: row.sku,
                    product_id: productId,
                    variant_id: variantId,
                    group_key: groupKey,
                  }),
                },
                update: {
                  status: 'applied',
                  action: item.apply_action,
                  result: json({
                    sku: row.sku,
                    product_id: productId,
                    variant_id: variantId,
                    group_key: groupKey,
                  }),
                  error_code: null,
                  error_message: null,
                  updated_at: new Date(),
                },
              });
            } catch (error) {
              throw new CatalogImportRowError(item, error);
            }
          }
          const appliedCount = await tx.catalogImportRowResult.count({
            where: { import_id: record.id, status: 'applied' },
          });
          await tx.catalogImport.update({
            where: { id: record.id },
            data: {
              applied_count: appliedCount,
              progress: this.commitProgress(
                appliedCount,
                this.validRowCount(preview),
              ),
              updated_at: new Date(),
            },
          });
          return localGroups;
        },
        { timeout: 60_000 },
      );
      groupedProducts.clear();
      for (const [key, productId] of committedGroups)
        groupedProducts.set(key, productId);
    } catch (error) {
      const failure =
        error instanceof CatalogImportRowError
          ? error
          : new CatalogImportRowError(failingRow, error);
      await this.failCommit(record, preview, failure, commitAttempt);
      throw error;
    }
  }

  private async finishCommit(
    record: ImportRecord,
    preview: ImportPreview,
    stockRows: ImportPreviewRow[],
    commitAttempt: number,
  ) {
    let failingRow = stockRows[0];
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM catalog_imports WHERE id = ${record.id}::uuid FOR UPDATE`;
          const fresh = await tx.catalogImport.findUnique({
            where: { id: record.id },
          });
          if (
            !fresh ||
            fresh.status !== 'committing' ||
            fresh.commit_attempt !== commitAttempt
          )
            return;
          if (!fresh.operation_id || !fresh.committed_by)
            throw new ConflictException(
              'Catalog import commit ownership is missing',
            );
          const appliedStock = await tx.catalogImportRowResult.findMany({
            where: {
              import_id: record.id,
              sheet: 'Stock',
              status: 'applied',
            },
            select: { row_number: true },
          });
          const appliedStockRows = new Set(
            appliedStock.map((item) => item.row_number),
          );
          const pendingStock = stockRows.filter(
            (item) => !appliedStockRows.has(item.row),
          );
          let openingId = fresh.opening_id;
          if (pendingStock.length) {
            const lines = [];
            for (const item of pendingStock) {
              failingRow = item;
              const row = item.stock!;
              const variant = await tx.productVariant.findUnique({
                where: { sku: row.sku },
                select: { id: true },
              });
              const locations = await tx.warehouseLocation.findMany({
                where: {
                  code: row.location_code,
                  is_active: true,
                  warehouse: { is_active: true },
                },
                select: { id: true },
              });
              if (!variant || locations.length !== 1)
                throw new CatalogImportRowError(
                  item,
                  new ConflictException(
                    'Validated stock references changed before commit',
                  ),
                );
              lines.push({
                variant_id: variant.id,
                location_id: locations[0].id,
                quantity: row.quantity,
                unit_cost_iqd: row.unit_cost_iqd,
                ...(row.expiry ? { expiry_date: row.expiry } : {}),
              });
            }
            const opening = await this.inventory.createOpeningInTransaction(
              tx,
              fresh.committed_by,
              ['inventory.manage', 'cost.view'],
              {
                operation_id: `${fresh.operation_id.slice(0, 70)}:${record.id}:opening`,
                document_date: businessDateText(),
                lines,
              },
            );
            openingId = (opening as { id: string }).id;
            for (const item of pendingStock) {
              await tx.catalogImportRowResult.upsert({
                where: {
                  import_id_sheet_row_number: {
                    import_id: record.id,
                    sheet: item.sheet,
                    row_number: item.row,
                  },
                },
                create: {
                  import_id: record.id,
                  sheet: item.sheet,
                  row_number: item.row,
                  status: 'applied',
                  action: item.apply_action,
                  result: json({ opening_id: openingId, sku: item.sku }),
                },
                update: {
                  status: 'applied',
                  action: item.apply_action,
                  result: json({ opening_id: openingId, sku: item.sku }),
                  error_code: null,
                  error_message: null,
                  updated_at: new Date(),
                },
              });
            }
          }
          const appliedCount = await tx.catalogImportRowResult.count({
            where: { import_id: record.id, status: 'applied' },
          });
          const result = {
            id: record.id,
            status: 'completed',
            operation_id: fresh.operation_id,
            created: preview.counts.create,
            updated: preview.counts.update,
            skipped_errors: preview.counts.error,
            applied_rows: appliedCount,
            total_rows: this.validRowCount(preview),
            opening_id: openingId,
          };
          await tx.catalogImport.update({
            where: { id: record.id },
            data: {
              status: 'completed',
              progress: 100,
              applied_count: appliedCount,
              opening_id: openingId,
              completed_at: new Date(),
              updated_at: new Date(),
            },
          });
          await this.audit.record(tx, {
            actorId: fresh.committed_by,
            action: 'catalog.import.commit',
            entityType: 'catalog_import',
            entityId: record.id,
            after: json(result),
          });
        },
        // The product work is deliberately split into short transactions. The
        // final opening balance is one immutable phase-5 document, so all its
        // stock lines must be posted atomically.
        { timeout: 120_000 },
      );
    } catch (error) {
      const failure =
        error instanceof CatalogImportRowError
          ? error
          : new CatalogImportRowError(failingRow ?? stockRows[0], error);
      await this.failCommit(record, preview, failure, commitAttempt);
      throw error;
    }
  }

  private async failCommit(
    record: ImportRecord,
    preview: ImportPreview,
    failure: CatalogImportRowError,
    commitAttempt: number,
  ) {
    const detail = this.failureDetail(failure.original);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM catalog_imports WHERE id = ${record.id}::uuid FOR UPDATE`;
      const fresh = await tx.catalogImport.findUnique({
        where: { id: record.id },
      });
      if (
        !fresh ||
        fresh.status !== 'committing' ||
        fresh.commit_attempt !== commitAttempt
      )
        return;
      if (failure.row) {
        await tx.catalogImportRowResult.upsert({
          where: {
            import_id_sheet_row_number: {
              import_id: record.id,
              sheet: failure.row.sheet,
              row_number: failure.row.row,
            },
          },
          create: {
            import_id: record.id,
            sheet: failure.row.sheet,
            row_number: failure.row.row,
            status: 'failed',
            action: failure.row.apply_action,
            error_code: detail.code,
            error_message: detail.message,
          },
          update: {
            status: 'failed',
            action: failure.row.apply_action,
            result: Prisma.JsonNull,
            error_code: detail.code,
            error_message: detail.message,
            updated_at: new Date(),
          },
        });
      }
      const appliedCount = await tx.catalogImportRowResult.count({
        where: { import_id: record.id, status: 'applied' },
      });
      await tx.catalogImport.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          applied_count: appliedCount,
          progress: this.commitProgress(
            appliedCount,
            this.validRowCount(preview),
          ),
          updated_at: new Date(),
        },
      });
      await this.audit.record(tx, {
        actorId: fresh.committed_by ?? record.created_by,
        action: 'catalog.import.commit_failed',
        entityType: 'catalog_import',
        entityId: record.id,
        after: json({
          commit_attempt: commitAttempt,
          applied_rows: appliedCount,
          failed_row: failure.row
            ? { sheet: failure.row.sheet, row: failure.row.row }
            : null,
          ...detail,
        }),
      });
    });
  }

  private failureDetail(error: unknown) {
    if (error && typeof error === 'object' && 'getResponse' in error) {
      const response = (error as { getResponse(): unknown }).getResponse();
      if (response && typeof response === 'object') {
        const body = response as { code?: unknown; message?: unknown };
        return {
          code:
            typeof body.code === 'string'
              ? body.code
              : 'CATALOG_IMPORT_ROW_FAILED',
          message:
            typeof body.message === 'string'
              ? body.message.slice(0, 500)
              : 'The row could not be applied because catalog data changed',
        };
      }
    }
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    )
      return {
        code: 'CATALOG_IMPORT_UNIQUE_CONFLICT',
        message: 'A unique catalog value changed after preview',
      };
    return {
      code: 'CATALOG_IMPORT_ROW_FAILED',
      message: 'The row could not be applied because catalog data changed',
    };
  }

  private validRowCount(preview: ImportPreview) {
    return preview.rows.filter(
      (row) =>
        row.apply_action &&
        !row.issues.some((issue) => issue.severity === 'error'),
    ).length;
  }

  private commitProgress(applied: number, total: number) {
    return total ? Math.min(95, Math.floor((applied / total) * 95)) : 0;
  }

  private commitResult(record: ImportRecord, preview: ImportPreview) {
    return {
      id: record.id,
      status: record.status,
      operation_id: record.operation_id,
      created: preview.counts.create,
      updated: preview.counts.update,
      skipped_errors: preview.counts.error,
      applied_rows: record.applied_count,
      total_rows: this.validRowCount(preview),
      opening_id: record.opening_id,
    };
  }

  async bulkImages(
    file: CatalogUpload | undefined,
    operationId: string,
    actor: Actor,
  ) {
    if (!file?.buffer?.length)
      throw new UnprocessableEntityException(
        'A non-empty .zip file is required',
      );
    if (file.size > MAX_ZIP_BYTES)
      throw new PayloadTooLargeException('Image archive is too large');
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(file.buffer);
    } catch {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'CATALOG_IMAGE_ZIP_INVALID',
        message: 'The uploaded file is not a valid ZIP archive',
        errors: [],
      });
    }
    const entries = Object.values(archive.files).filter(
      (entry) => !entry.dir && /\.(jpe?g|png|webp|avif)$/i.test(entry.name),
    );
    if (entries.length > MAX_ROWS)
      throw new PayloadTooLargeException(
        'Image archive contains too many files',
      );
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    return this.operations.execute({
      userId: actor.id,
      operationId,
      endpoint: 'POST /admin/catalog-images/bulk',
      payload: { operation_id: operationId, checksum },
      work: async (tx) => {
        const variants = await tx.productVariant.findMany({
          select: { sku: true, product_id: true },
        });
        const bySku = new Map(
          variants.map((row) => [row.sku.toLowerCase(), row]),
        );
        const matched: Array<{
          file: string;
          sku: string;
          product_id: string;
          url: string;
        }> = [];
        const unmatched: string[] = [];
        const sorted = entries.sort((left, right) =>
          left.name.localeCompare(right.name, 'en', { numeric: true }),
        );
        const nextOrder = new Map<string, number>();
        for (const entry of sorted) {
          const base = path.basename(entry.name).replace(/\.[^.]+$/, '');
          const exact = bySku.get(base.toLowerCase());
          const withoutOrder = bySku.get(
            base.replace(/-\d+$/, '').toLowerCase(),
          );
          const variant = exact ?? withoutOrder;
          if (!variant) {
            unmatched.push(entry.name);
            continue;
          }
          const bytes = await entry.async('nodebuffer');
          const uploaded = await this.media.uploadCatalogImage(bytes, actor.id);
          let sortOrder = nextOrder.get(variant.product_id);
          if (sortOrder === undefined) {
            const aggregate = await tx.productImage.aggregate({
              where: { product_id: variant.product_id },
              _max: { sort_order: true },
            });
            sortOrder = (aggregate._max.sort_order ?? -1) + 1;
          }
          await tx.productImage.create({
            data: {
              product_id: variant.product_id,
              url: uploaded.public_url,
              sort_order: sortOrder,
            },
          });
          nextOrder.set(variant.product_id, sortOrder + 1);
          matched.push({
            file: entry.name,
            sku: variant.sku,
            product_id: variant.product_id,
            url: uploaded.public_url,
          });
        }
        const result = { operation_id: operationId, matched, unmatched };
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'catalog.images.bulk_upload',
          entityType: 'catalog_image_import',
          after: json({
            operation_id: operationId,
            matched: matched.length,
            unmatched,
          }),
        });
        return result;
      },
    });
  }

  private async buildPreview(
    products: ReturnType<typeof parseProducts>,
    stocks: ReturnType<typeof parseStock>,
    createMissing: boolean,
  ): Promise<ImportPreview> {
    const skus = products.map(({ row }) => row.sku).filter(Boolean);
    const barcodes = products
      .map(({ row }) => row.barcode)
      .filter((value): value is string => Boolean(value));
    const [existingVariants, categories, brands, locations, currencies] =
      await Promise.all([
        this.prisma.productVariant.findMany({
          where: { OR: [{ sku: { in: skus } }, { barcode: { in: barcodes } }] },
          select: { id: true, sku: true, barcode: true },
        }),
        this.prisma.category.findMany(),
        this.prisma.brand.findMany(),
        this.prisma.warehouseLocation.findMany({
          where: { is_active: true, warehouse: { is_active: true } },
          select: { code: true },
        }),
        this.prisma.currency.findMany({
          where: { enabled: true },
          select: { code: true },
        }),
      ]);
    const existingSku = new Set(existingVariants.map((item) => item.sku));
    const existingBarcode = new Map(
      existingVariants
        .filter((item) => item.barcode)
        .map((item) => [item.barcode!, item.sku]),
    );
    const fileSkuCounts = new Map<string, number>();
    const fileBarcodeCounts = new Map<string, number>();
    for (const sku of skus)
      fileSkuCounts.set(sku, (fileSkuCounts.get(sku) ?? 0) + 1);
    for (const barcode of barcodes)
      fileBarcodeCounts.set(barcode, (fileBarcodeCounts.get(barcode) ?? 0) + 1);
    const currencySet = new Set(currencies.map((item) => item.code));
    const rows: ImportPreviewRow[] = [];
    for (const parsed of products) {
      const { row } = parsed;
      const issues = [...parsed.issues];
      if ((fileSkuCounts.get(row.sku) ?? 0) > 1) {
        issues.push(
          this.issue(
            'error',
            'SKU_DUPLICATE_IN_FILE',
            row.sheet,
            row.row,
            column(productColumns, 'sku'),
            'SKU appears more than once in the workbook',
          ),
        );
      }
      if (row.barcode) {
        const owner = existingBarcode.get(row.barcode);
        if (
          (owner && owner !== row.sku) ||
          (fileBarcodeCounts.get(row.barcode) ?? 0) > 1
        ) {
          issues.push(
            this.issue(
              'error',
              'BARCODE_DUPLICATE',
              row.sheet,
              row.row,
              column(productColumns, 'barcode'),
              'Barcode must be unique',
            ),
          );
        }
      }
      const root = this.findCategory(categories, row.category_level_1, null);
      const child = root
        ? this.findCategory(categories, row.category_level_2, root.id)
        : undefined;
      if ((!root || !child) && !createMissing) {
        issues.push(
          this.issue(
            'error',
            'CATEGORY_NOT_FOUND',
            row.sheet,
            row.row,
            column(
              productColumns,
              !root ? 'category_level_1' : 'category_level_2',
            ),
            'Category is missing; select create missing to add it',
          ),
        );
      }
      if (row.brand && !this.findBrand(brands, row.brand) && !createMissing) {
        issues.push(
          this.issue(
            'error',
            'BRAND_NOT_FOUND',
            row.sheet,
            row.row,
            column(productColumns, 'brand'),
            'Brand is missing; select create missing to add it',
          ),
        );
      }
      if (
        row.reference_currency_code &&
        !currencySet.has(row.reference_currency_code)
      ) {
        issues.push(
          this.issue(
            'error',
            'CURRENCY_NOT_ENABLED',
            row.sheet,
            row.row,
            column(productColumns, 'reference_currency_code'),
            'Linked currency is not enabled',
          ),
        );
      }
      const applyAction = existingSku.has(row.sku)
        ? ('update' as const)
        : ('create' as const);
      rows.push(
        this.previewRow(row.sheet, row.row, row.sku, applyAction, issues, {
          product: row,
        }),
      );
    }
    const validWorkbookSkus = rows
      .filter(
        (item) =>
          item.product &&
          !item.issues.some((issue) => issue.severity === 'error'),
      )
      .map((item) => item.product!.sku);
    const availableSku = new Set([...existingSku, ...validWorkbookSkus]);
    const locationCounts = new Map<string, number>();
    for (const location of locations)
      locationCounts.set(
        location.code,
        (locationCounts.get(location.code) ?? 0) + 1,
      );
    for (const parsed of stocks) {
      const { row } = parsed;
      const issues = [...parsed.issues];
      if (!availableSku.has(row.sku)) {
        issues.push(
          this.issue(
            'error',
            'SKU_NOT_FOUND',
            row.sheet,
            row.row,
            column(stockColumns, 'sku'),
            'Stock SKU does not exist and is not created by this workbook',
          ),
        );
      }
      const locationCount = locationCounts.get(row.location_code) ?? 0;
      if (locationCount !== 1) {
        issues.push(
          this.issue(
            'error',
            locationCount ? 'LOCATION_CODE_AMBIGUOUS' : 'LOCATION_NOT_FOUND',
            row.sheet,
            row.row,
            column(stockColumns, 'location_code'),
            locationCount
              ? 'Location code matches more than one warehouse'
              : 'Active location code not found',
          ),
        );
      }
      rows.push(
        this.previewRow(row.sheet, row.row, row.sku, 'create', issues, {
          stock: row,
        }),
      );
    }
    return {
      rows,
      counts: {
        total: rows.length,
        create: rows.filter(
          (row) =>
            row.apply_action === 'create' &&
            !row.issues.some((issue) => issue.severity === 'error'),
        ).length,
        update: rows.filter(
          (row) =>
            row.apply_action === 'update' &&
            !row.issues.some((issue) => issue.severity === 'error'),
        ).length,
        error: rows.filter((row) =>
          row.issues.some((issue) => issue.severity === 'error'),
        ).length,
        warning: rows.filter(
          (row) =>
            !row.issues.some((issue) => issue.severity === 'error') &&
            row.issues.some((issue) => issue.severity === 'warning'),
        ).length,
      },
    };
  }

  private previewRow(
    sheet: ImportPreviewRow['sheet'],
    row: number,
    sku: string,
    applyAction: 'create' | 'update',
    issues: ImportIssue[],
    data: Pick<ImportPreviewRow, 'product' | 'stock'>,
  ): ImportPreviewRow {
    const hasError = issues.some((item) => item.severity === 'error');
    const hasWarning = issues.some((item) => item.severity === 'warning');
    return {
      sheet,
      row,
      sku: sku || null,
      action: hasError ? 'error' : hasWarning ? 'warning' : applyAction,
      apply_action: hasError ? null : applyAction,
      issues,
      ...data,
    };
  }

  private issue(
    severity: 'error' | 'warning',
    code: string,
    sheet: string,
    row: number,
    col: number,
    message: string,
  ): ImportIssue {
    return { severity, code, cell: cellRef(sheet, row, col), message };
  }

  private findCategory<
    T extends {
      id: string;
      parent_id: string | null;
      name_en: string;
      name_ar: string;
    },
  >(rows: T[], value: string, parentId: string | null) {
    const pair = names(value);
    const candidates = new Set([
      normalize(value),
      normalize(pair.en),
      normalize(pair.ar),
    ]);
    return rows.find(
      (row) =>
        row.parent_id === parentId &&
        (candidates.has(normalize(row.name_en)) ||
          candidates.has(normalize(row.name_ar))),
    );
  }

  private findBrand<T extends { name_en: string; name_ar: string }>(
    rows: T[],
    value: string,
  ) {
    const pair = names(value);
    const candidates = new Set([
      normalize(value),
      normalize(pair.en),
      normalize(pair.ar),
    ]);
    return rows.find(
      (row) =>
        candidates.has(normalize(row.name_en)) ||
        candidates.has(normalize(row.name_ar)),
    );
  }

  private async resolveTaxonomy(
    tx: Prisma.TransactionClient,
    row: ParsedProductRow,
    createMissing: boolean,
  ) {
    const allCategories = await tx.category.findMany();
    let root = this.findCategory(allCategories, row.category_level_1, null);
    if (!root && createMissing) {
      const pair = names(row.category_level_1);
      root = await tx.category.create({
        data: {
          name_en: pair.en,
          name_ar: pair.ar,
          slug: slug(row.category_level_1),
          is_visible: false,
        },
      });
      allCategories.push(root);
    }
    let child = root
      ? this.findCategory(allCategories, row.category_level_2, root.id)
      : undefined;
    if (!child && root && createMissing) {
      const pair = names(row.category_level_2);
      child = await tx.category.create({
        data: {
          parent_id: root.id,
          name_en: pair.en,
          name_ar: pair.ar,
          slug: slug(`${row.category_level_1}-${row.category_level_2}`),
          is_visible: false,
        },
      });
    }
    if (!root || !child)
      throw new ConflictException(
        'Validated category references changed before commit',
      );
    let brandId: string | null = null;
    if (row.brand) {
      const brands = await tx.brand.findMany();
      let brand = this.findBrand(brands, row.brand);
      if (!brand && createMissing) {
        const pair = names(row.brand);
        brand = await tx.brand.create({
          data: {
            name_en: pair.en,
            name_ar: pair.ar,
            slug: slug(row.brand),
            is_visible: false,
          },
        });
      }
      if (!brand)
        throw new ConflictException(
          'Validated brand reference changed before commit',
        );
      brandId = brand.id;
    }
    return { categoryId: child.id, brandId };
  }

  private async price(tx: Prisma.TransactionClient, row: ParsedProductRow) {
    if (row.price_iqd !== null) return row.price_iqd;
    const rate = await tx.exchangeRate.findFirst({
      where: {
        currency_code: row.reference_currency_code!,
        effective_at: { lte: new Date() },
      },
      orderBy: [{ effective_at: 'desc' }, { id: 'desc' }],
    });
    if (!rate) {
      throw new ConflictException({
        status: 409,
        code: 'EXCHANGE_RATE_REQUIRED',
        message: `No exchange rate exists for ${row.reference_currency_code}`,
        errors: [],
      });
    }
    const setting = await tx.storeSetting.findUnique({
      where: { key: 'sale_rounding_multiple' },
    });
    const raw = D(row.reference_price!).mul(rate.rate);
    const multiple = D(setting?.value || 0);
    return Number(
      multiple.gt(0)
        ? raw.div(multiple).ceil().mul(multiple)
        : raw.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
    );
  }

  private variantData(
    row: ParsedProductRow,
    productId: string,
    price: number,
    actorId: string,
  ) {
    const linked = row.reference_currency_code !== null;
    return {
      product_id: productId,
      sku: row.sku,
      barcode: row.barcode,
      attributes: json(row.attributes),
      base_unit: row.base_unit,
      whole_units_only: row.whole_units_only,
      low_stock_threshold: row.low_stock_threshold,
      pricing_mode: linked ? 'linked' : 'fixed',
      reference_currency_code: row.reference_currency_code,
      reference_price: row.reference_price,
      selling_price: linked ? null : price,
      published_price: linked ? price : null,
      price_delta: 0,
      currency_code: 'IQD',
      price_approved_at: new Date(),
      price_proposed_by: actorId,
      updated_at: new Date(),
    };
  }

  private async attachRemoteImages(
    tx: Prisma.TransactionClient,
    productId: string,
    urls: string[],
    actorId: string,
  ) {
    const aggregate = await tx.productImage.aggregate({
      where: { product_id: productId },
      _max: { sort_order: true },
    });
    let order = (aggregate._max.sort_order ?? -1) + 1;
    for (const source of urls) {
      let url: URL;
      try {
        url = new URL(source);
      } catch {
        throw new UnprocessableEntityException(`Invalid image URL: ${source}`);
      }
      if (!['http:', 'https:'].includes(url.protocol))
        throw new UnprocessableEntityException(
          `Unsupported image URL: ${source}`,
        );
      let response: Response;
      try {
        response = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
          redirect: 'follow',
        });
      } catch {
        throw new UnprocessableEntityException(
          `Image URL could not be fetched: ${source}`,
        );
      }
      if (!response.ok)
        throw new UnprocessableEntityException(
          `Image URL returned ${response.status}: ${source}`,
        );
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > 8 * 1024 * 1024)
        throw new PayloadTooLargeException(
          `Remote image is too large: ${source}`,
        );
      const uploaded = await this.media.uploadCatalogImage(
        Buffer.from(await response.arrayBuffer()),
        actorId,
      );
      await tx.productImage.create({
        data: {
          product_id: productId,
          url: uploaded.public_url,
          sort_order: order,
        },
      });
      order += 1;
    }
  }

  private async require(id: string) {
    const record = await this.prisma.catalogImport.findUnique({
      where: { id },
      include: importWithCreator,
    });
    if (!record) throw new NotFoundException('Catalog import not found');
    return record;
  }

  private present<
    T extends {
      source_object_key: string;
      source_checksum: string;
      error_report_key: string | null;
      preview: Prisma.JsonValue | null;
      status: string;
      creator: Parameters<typeof actorDisplayName>[0];
    },
  >(
    record: T,
    permissions: string[],
    results: Array<{
      sheet: string;
      row_number: number;
      status: string;
      error_code: string | null;
      error_message: string | null;
    }> = [],
  ) {
    const {
      source_object_key: _objectKey,
      source_checksum: _checksum,
      creator,
      ...safe
    } = record;
    void _objectKey;
    void _checksum;
    const publicSafe = {
      ...safe,
      created_by_name: actorDisplayName(creator),
      error_report_key: safe.error_report_key ? 'available' : null,
    };
    if (!record.preview) return publicSafe;
    const preview = JSON.parse(JSON.stringify(record.preview)) as ImportPreview;
    const byRow = new Map(
      results.map((result) => [`${result.sheet}:${result.row_number}`, result]),
    );
    const completedWithoutMarkers =
      safe.status === 'completed' && results.length === 0;
    for (const row of preview.rows) {
      const result = byRow.get(`${row.sheet}:${row.row}`);
      row.commit_status = row.apply_action
        ? result?.status === 'applied' || completedWithoutMarkers
          ? 'applied'
          : result?.status === 'failed'
            ? 'failed'
            : 'pending'
        : 'skipped';
      row.commit_error =
        result?.status === 'failed'
          ? {
              code: result.error_code ?? 'CATALOG_IMPORT_ROW_FAILED',
              message: result.error_message ?? 'The row could not be applied',
            }
          : null;
    }
    if (!permissions.includes('cost.view')) {
      for (const row of preview.rows) {
        if (row.stock)
          delete (row.stock as Partial<typeof row.stock>).unit_cost_iqd;
      }
    }
    return { ...publicSafe, preview };
  }

  private presentSummary<
    T extends {
      creator: Parameters<typeof actorDisplayName>[0];
      error_report_key: string | null;
    },
  >(record: T) {
    const { creator, ...safe } = record;
    return {
      ...safe,
      created_by_name: actorDisplayName(creator),
      error_report_key: safe.error_report_key ? 'available' : null,
    };
  }

  private errorReport(preview: ImportPreview) {
    const escape = (value: string | number | null) => {
      const printable = value === null ? '' : String(value);
      return `"${printable.replace(/"/g, '""')}"`;
    };
    const lines = [
      ['sheet', 'row', 'sku', 'action', 'severity', 'code', 'cell', 'message']
        .map(escape)
        .join(','),
    ];
    for (const row of preview.rows) {
      if (!row.issues.length)
        lines.push(
          [row.sheet, row.row, row.sku, row.action, '', '', '', '']
            .map(escape)
            .join(','),
        );
      for (const issue of row.issues)
        lines.push(
          [
            row.sheet,
            row.row,
            row.sku,
            row.action,
            issue.severity,
            issue.code,
            issue.cell,
            issue.message,
          ]
            .map(escape)
            .join(','),
        );
    }
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  }
}
