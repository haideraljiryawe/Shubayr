import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import ExcelJS from 'exceljs';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ObjectStorageService } from '../media/object-storage.service';
import type { CreateReportExportDto } from './reports.dto';
import { ReportsService } from './reports.service';

type Actor = { id: string; permissions: string[] };
type ExportType = CreateReportExportDto['report_type'];

const permissions: Record<ExportType, string> = {
  sales: 'reports.sales.read',
  profitability: 'reports.profit.read',
  profit_loss: 'reports.financial.read',
  trial_balance: 'reports.financial.read',
  balance_sheet: 'reports.financial.read',
};

const labels: Record<string, { en: string; ar: string }> = {
  key: { en: 'Key', ar: 'الرمز' },
  name_ar: { en: 'Arabic name', ar: 'الاسم بالعربية' },
  name_en: { en: 'English name', ar: 'الاسم بالإنجليزية' },
  gross_sales: { en: 'Gross sales (IQD)', ar: 'إجمالي المبيعات (د.ع)' },
  tier_discounts: { en: 'Tier discounts (IQD)', ar: 'خصومات الشرائح (د.ع)' },
  coupon_discounts: {
    en: 'Coupon discounts (IQD)',
    ar: 'خصومات القسائم (د.ع)',
  },
  other_discounts: { en: 'Other discounts (IQD)', ar: 'خصومات أخرى (د.ع)' },
  returns: { en: 'Returns (IQD)', ar: 'المرتجعات (د.ع)' },
  net_sales: { en: 'Net sales (IQD)', ar: 'صافي المبيعات (د.ع)' },
  order_count: { en: 'Order count', ar: 'عدد الطلبات' },
  average_order_value: { en: 'Average order value', ar: 'متوسط قيمة الطلب' },
  cost_of_goods_sold: { en: 'Cost of goods sold', ar: 'كلفة البضاعة المباعة' },
  return_cost_reversals: {
    en: 'Return cost reversals',
    ar: 'عكس كلفة المرتجعات',
  },
  gross_profit: { en: 'Gross profit', ar: 'إجمالي الربح' },
  margin_percent: { en: 'Margin %', ar: 'هامش الربح %' },
  inventory_write_downs: { en: 'Inventory write-downs', ar: 'خسائر المخزون' },
  code: { en: 'Account code', ar: 'رمز الحساب' },
  type: { en: 'Account type', ar: 'نوع الحساب' },
  normal_side: { en: 'Normal side', ar: 'الجانب الطبيعي' },
  debit: { en: 'Debit (IQD)', ar: 'مدين (د.ع)' },
  credit: { en: 'Credit (IQD)', ar: 'دائن (د.ع)' },
  balance: { en: 'Balance (IQD)', ar: 'الرصيد (د.ع)' },
  line: { en: 'Line', ar: 'البند' },
  current: { en: 'Current period (IQD)', ar: 'الفترة الحالية (د.ع)' },
  previous: { en: 'Previous period (IQD)', ar: 'الفترة السابقة (د.ع)' },
};

@Injectable()
export class ReportExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly storage: ObjectStorageService,
    private readonly audit: AuditService,
    @InjectQueue('report-exports') private readonly queue: Queue,
  ) {}

  async create(actor: Actor, input: CreateReportExportDto) {
    this.require(actor, input.report_type);
    this.validateDates(input);
    const record = await this.prisma.reportExport.create({
      data: {
        report_type: input.report_type,
        format: input.format,
        language: input.language ?? 'en',
        parameters: JSON.parse(JSON.stringify(input)) as Prisma.InputJsonObject,
        created_by: actor.id,
      },
    });
    await this.audit.record(this.prisma, {
      actorId: actor.id,
      action: 'report.export.create',
      entityType: 'report_export',
      entityId: record.id,
      after: input as unknown as Prisma.InputJsonObject,
    });
    try {
      await this.queue.add(
        'generate',
        { exportId: record.id },
        {
          jobId: record.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch {
      await this.prisma.reportExport.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          last_error: 'The report export queue is unavailable',
          completed_at: new Date(),
        },
      });
      throw new ServiceUnavailableException({
        status: 503,
        code: 'REPORT_EXPORT_QUEUE_UNAVAILABLE',
        message: 'The report export worker is unavailable',
        errors: [],
      });
    }
    return this.progress(record.id, actor);
  }

  async progress(id: string, actor: Actor) {
    const row = await this.requireRecord(id, actor);
    return {
      id: row.id,
      report_type: row.report_type,
      format: row.format,
      language: row.language,
      status: row.status,
      rows_done: row.rows_done,
      rows_total: row.rows_total,
      last_error: row.last_error,
      created_at: row.created_at,
      started_at: row.started_at,
      completed_at: row.completed_at,
      download_ready: row.status === 'completed' && Boolean(row.object_key),
    };
  }

  async download(id: string, actor: Actor) {
    const row = await this.requireRecord(id, actor);
    if (row.status !== 'completed' || !row.object_key || !row.file_name) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'REPORT_EXPORT_NOT_READY',
        message: 'The report export is not ready for download',
        errors: [],
      });
    }
    return {
      body: await this.storage.get(row.object_key),
      fileName: row.file_name,
      contentType: row.content_type ?? 'application/octet-stream',
    };
  }

  async resumeInterrupted() {
    const rows = await this.prisma.reportExport.findMany({
      where: { status: { in: ['queued', 'processing'] } },
      select: { id: true },
    });
    await Promise.all(rows.map((row) => this.enqueue(row.id)));
  }

  async process(exportId: string) {
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'report-export:' + exportId}))::text`;
      const row = await tx.reportExport.findUnique({ where: { id: exportId } });
      if (!row || row.status === 'completed') return null;
      return tx.reportExport.update({
        where: { id: exportId },
        data: {
          status: 'processing',
          rows_done: 0,
          rows_total: 0,
          last_error: null,
          started_at: row.started_at ?? new Date(),
          completed_at: null,
        },
      });
    });
    if (!claimed) return;
    try {
      const parameters = claimed.parameters as unknown as CreateReportExportDto;
      const actor: Actor = {
        id: claimed.created_by,
        permissions: Object.values(permissions),
      };
      const rows = await this.rows(actor, parameters, async (done, total) => {
        await this.prisma.reportExport.update({
          where: { id: exportId },
          data: { rows_done: done, rows_total: total },
        });
      });
      const language = claimed.language === 'ar' ? 'ar' : 'en';
      const file =
        claimed.format === 'xlsx'
          ? await this.xlsx(rows, language)
          : this.csv(rows, language);
      const extension = claimed.format === 'xlsx' ? 'xlsx' : 'csv';
      const contentType =
        extension === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv; charset=utf-8';
      const objectKey = `report-exports/${claimed.created_by}/${claimed.id}.${extension}`;
      await this.storage.put(objectKey, file, contentType);
      await this.prisma.reportExport.update({
        where: { id: exportId },
        data: {
          status: 'completed',
          rows_done: rows.length,
          rows_total: rows.length,
          object_key: objectKey,
          file_name: `shubayr-${claimed.report_type}-${claimed.id}.${extension}`,
          content_type: contentType,
          completed_at: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.reportExport.update({
        where: { id: exportId },
        data: {
          status: 'failed',
          last_error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : 'Export failed',
          completed_at: new Date(),
        },
      });
      throw error;
    }
  }

  private async rows(
    actor: Actor,
    input: CreateReportExportDto,
    progress: (done: number, total: number) => Promise<void>,
  ): Promise<Array<Record<string, unknown>>> {
    if (input.report_type === 'profit_loss') {
      const report = await this.reports.profitLoss(
        actor,
        { from: input.from!, to: input.to! },
        false,
      );
      const keys = Object.keys(report.current).filter(
        (key) => key !== 'expenses',
      );
      const rows = keys.map((key) => ({
        line: key,
        current: (report.current as Record<string, unknown>)[key],
        previous: (report.previous as Record<string, unknown>)[key],
      }));
      for (const expense of report.current.expenses) {
        const prior = report.previous.expenses.find(
          (item) => item.id === expense.id,
        );
        rows.push({
          line: `expense:${expense.name_en}`,
          current: expense.amount,
          previous: prior?.amount ?? '0.0000',
        });
      }
      await progress(rows.length, rows.length);
      return rows;
    }
    const perPage = 500;
    let page = 1;
    let total: number;
    const rows: Array<Record<string, unknown>> = [];
    do {
      const report =
        input.report_type === 'sales'
          ? await this.reports.sales(
              actor,
              {
                from: input.from!,
                to: input.to!,
                group_by: input.group_by,
                page,
                per_page: perPage,
              },
              false,
            )
          : input.report_type === 'profitability'
            ? await this.reports.profitability(
                actor,
                {
                  from: input.from!,
                  to: input.to!,
                  group_by: (input.group_by ?? 'product') as never,
                  page,
                  per_page: perPage,
                },
                false,
              )
            : input.report_type === 'trial_balance'
              ? await this.reports.trialBalance(actor, {
                  as_of: input.as_of!,
                  page,
                  per_page: perPage,
                })
              : await this.reports.balanceSheet(actor, {
                  as_of: input.as_of!,
                  page,
                  per_page: perPage,
                });
      total = report.pagination.total;
      rows.push(...(report.data as Array<Record<string, unknown>>));
      await progress(rows.length, total);
      page += 1;
    } while (rows.length < total);
    return rows;
  }

  private csv(rows: Array<Record<string, unknown>>, language: 'ar' | 'en') {
    const keys = rows.length ? Object.keys(rows[0]) : ['line'];
    const cell = (value: unknown) => {
      const text =
        value === null || value === undefined
          ? ''
          : typeof value === 'string'
            ? value
            : typeof value === 'number' ||
                typeof value === 'boolean' ||
                typeof value === 'bigint'
              ? value.toString()
              : typeof value === 'object'
                ? JSON.stringify(value)
                : (JSON.stringify(value) ?? '');
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [
      keys.map((key) => cell(labels[key]?.[language] ?? key)).join(','),
      ...rows.map((row) => keys.map((key) => cell(row[key])).join(',')),
    ];
    return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
  }

  private async xlsx(
    rows: Array<Record<string, unknown>>,
    language: 'ar' | 'en',
  ) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(
      language === 'ar' ? 'التقرير' : 'Report',
      {
        views: [{ rightToLeft: language === 'ar' }],
      },
    );
    const keys = rows.length ? Object.keys(rows[0]) : ['line'];
    sheet.columns = keys.map((key) => ({
      key,
      header: labels[key]?.[language] ?? key,
      width: 24,
    }));
    for (const row of rows) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [
      { state: 'frozen', ySplit: 1, rightToLeft: language === 'ar' },
    ];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private validateDates(input: CreateReportExportDto) {
    const period = ['sales', 'profitability', 'profit_loss'].includes(
      input.report_type,
    );
    if (period && (!input.from || !input.to)) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'REPORT_EXPORT_PARAMETERS_INVALID',
        message: 'from and to are required for this report',
        errors: [],
      });
    }
    if (!period && !input.as_of) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'REPORT_EXPORT_PARAMETERS_INVALID',
        message: 'as_of is required for this report',
        errors: [],
      });
    }
    if (
      input.report_type === 'profitability' &&
      input.group_by &&
      !['department', 'category', 'product', 'sku'].includes(input.group_by)
    ) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'REPORT_EXPORT_PARAMETERS_INVALID',
        message: 'The profitability report does not support that grouping',
        errors: [],
      });
    }
  }

  private require(actor: Actor, type: ExportType) {
    const permission = permissions[type];
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException({
        status: 403,
        code: 'PERMISSION_DENIED',
        message: `Missing permission: ${permission}`,
        errors: [],
      });
    }
  }

  private async requireRecord(id: string, actor: Actor) {
    const row = await this.prisma.reportExport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Report export not found');
    this.require(actor, row.report_type as ExportType);
    return row;
  }

  private async enqueue(id: string) {
    const job = await this.queue.getJob(id);
    if (job) {
      const state = await job.getState();
      if (!['failed', 'completed'].includes(state)) return;
      await job.remove();
    }
    await this.queue.add(
      'generate',
      { exportId: id },
      { jobId: id, attempts: 3, removeOnComplete: 100, removeOnFail: 100 },
    );
  }
}
