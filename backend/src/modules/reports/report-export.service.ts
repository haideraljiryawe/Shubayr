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
import sharp from 'sharp';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ObjectStorageService } from '../media/object-storage.service';
import type { CreateReportExportDto } from './reports.dto';
import { ReportsService } from './reports.service';
import { ReportsPart2Service } from './reports-part2.service';
import { ReportsPart3Service } from './reports-part3.service';
import { ReportPdfService, type PdfLabelValue } from './report-pdf.service';

type Actor = { id: string; permissions: string[] };
type ExportType = CreateReportExportDto['report_type'];

const permissions: Record<ExportType, string> = {
  sales: 'reports.sales.read',
  profitability: 'reports.profit.read',
  profit_loss: 'reports.financial.read',
  trial_balance: 'reports.financial.read',
  balance_sheet: 'reports.financial.read',
  cash: 'reports.cash.read',
  delivery_custody: 'reports.cash.read',
  liabilities: 'reports.liabilities.read',
  inventory_valuation: 'reports.inventory.read',
  purchases: 'reports.purchases.read',
  supplier_statement: 'reports.suppliers.read',
  stock_movement: 'reports.stock.read',
  expenses: 'reports.expenses.read',
};

const reportTitles: Record<ExportType, { en: string; ar: string }> = {
  sales: { en: 'Sales report', ar: 'تقرير المبيعات' },
  profitability: { en: 'Profitability report', ar: 'تقرير الربحية' },
  profit_loss: { en: 'Profit and loss', ar: 'قائمة الأرباح والخسائر' },
  trial_balance: { en: 'Trial balance', ar: 'ميزان المراجعة' },
  balance_sheet: { en: 'Balance sheet', ar: 'الميزانية العمومية' },
  cash: { en: 'Cash report', ar: 'تقرير النقد' },
  delivery_custody: { en: 'Delivery custody', ar: 'عهد التوصيل' },
  liabilities: { en: 'Liabilities report', ar: 'تقرير الالتزامات' },
  inventory_valuation: {
    en: 'Inventory valuation',
    ar: 'تقييم المخزون',
  },
  purchases: { en: 'Purchases report', ar: 'تقرير المشتريات' },
  supplier_statement: { en: 'Supplier statement', ar: 'كشف حساب المورد' },
  stock_movement: { en: 'Stock movement', ar: 'حركة المخزون' },
  expenses: { en: 'Expenses report', ar: 'تقرير المصروفات' },
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
  cash_account: { en: 'Cash account', ar: 'حساب النقد' },
  opening_balance: { en: 'Opening balance', ar: 'الرصيد الافتتاحي' },
  inflows: { en: 'Inflows', ar: 'التدفقات الداخلة' },
  outflows: { en: 'Outflows', ar: 'التدفقات الخارجة' },
  closing_balance: { en: 'Closing balance', ar: 'الرصيد الختامي' },
  sources: { en: 'Sources', ar: 'المصادر' },
  party: { en: 'Delivery party', ar: 'جهة التوصيل' },
  goods_quantity: { en: 'Goods quantity', ar: 'كمية البضاعة' },
  goods_value: { en: 'Goods value', ar: 'قيمة البضاعة' },
  cash_held: { en: 'Cash held', ar: 'النقد المحتفظ به' },
  oldest_goods_age_days: {
    en: 'Oldest goods age (days)',
    ar: 'عمر أقدم بضاعة (أيام)',
  },
  oldest_cash_age_days: {
    en: 'Oldest cash age (days)',
    ar: 'عمر أقدم نقد (أيام)',
  },
  entity_id: { en: 'Entity ID', ar: 'معرف الجهة' },
  name: { en: 'Name', ar: 'الاسم' },
  document_number: { en: 'Document number', ar: 'رقم المستند' },
  due_date: { en: 'Due date', ar: 'تاريخ الاستحقاق' },
  age_days: { en: 'Age (days)', ar: 'العمر (أيام)' },
  ageing_bucket: { en: 'Ageing bucket', ar: 'فئة التقادم' },
  amount: { en: 'Amount', ar: 'المبلغ' },
  ledger_backed: { en: 'Ledger backed', ar: 'مدعوم بدفتر الأستاذ' },
  variant_id: { en: 'Variant ID', ar: 'معرف الصنف' },
  sku: { en: 'SKU', ar: 'رمز الصنف' },
  product: { en: 'Product', ar: 'المنتج' },
  category: { en: 'Category', ar: 'الفئة' },
  department: { en: 'Department', ar: 'القسم' },
  warehouse: { en: 'Warehouse', ar: 'المخزن' },
  quantity: { en: 'Quantity', ar: 'الكمية' },
  moving_average_cost: {
    en: 'Moving-average cost',
    ar: 'كلفة المتوسط المتحرك',
  },
  value: { en: 'Value', ar: 'القيمة' },
  stock_state: { en: 'Stock state', ar: 'حالة المخزون' },
  last_sale_date: { en: 'Last sale date', ar: 'تاريخ آخر بيع' },
  slow_moving: { en: 'Slow moving', ar: 'بطيء الحركة' },
  purchased_quantity: { en: 'Purchased quantity', ar: 'الكمية المشتراة' },
  returned_quantity: { en: 'Returned quantity', ar: 'الكمية المرتجعة' },
  net_quantity: { en: 'Net quantity', ar: 'صافي الكمية' },
  goods_cost_iqd: { en: 'Goods cost (IQD)', ar: 'تكلفة البضاعة (د.ع)' },
  landed_cost_iqd: { en: 'Landed cost (IQD)', ar: 'التكلفة الواصلة (د.ع)' },
  purchase_cost_iqd: { en: 'Purchase cost (IQD)', ar: 'تكلفة الشراء (د.ع)' },
  returns_iqd: { en: 'Supplier returns (IQD)', ar: 'مرتجعات المورد (د.ع)' },
  net_cost_iqd: { en: 'Net cost (IQD)', ar: 'صافي التكلفة (د.ع)' },
  prepaid_amortisation_iqd: {
    en: 'Prepaid amortisation (IQD)',
    ar: 'إطفاء المصروف المقدم (د.ع)',
  },
  total_iqd: { en: 'Total (IQD)', ar: 'الإجمالي (د.ع)' },
  original_delivery_fees: {
    en: 'Original delivery fees (IQD)',
    ar: 'أجور التوصيل الأصلية (د.ع)',
  },
  charged_delivery_fees: {
    en: 'Charged delivery fees (IQD)',
    ar: 'أجور التوصيل المحصلة (د.ع)',
  },
  delivery_fee_adjustments: {
    en: 'Delivery fee adjustments (IQD)',
    ar: 'تعديلات أجور التوصيل (د.ع)',
  },
  delivery_fee_refunds: {
    en: 'Delivery fee refunds (IQD)',
    ar: 'مبالغ أجور التوصيل المستردة (د.ع)',
  },
  cancelled_count: { en: 'Cancelled orders', ar: 'الطلبات الملغاة' },
  rejected_count: { en: 'Rejected orders', ar: 'الطلبات المرفوضة' },
  account_id: { en: 'Account ID', ar: 'معرف الحساب' },
  account_code: { en: 'Account code', ar: 'رمز الحساب' },
  section: { en: 'Section', ar: 'القسم المحاسبي' },
  current_amount: { en: 'Current period (IQD)', ar: 'الفترة الحالية (د.ع)' },
  previous_amount: { en: 'Previous period (IQD)', ar: 'الفترة السابقة (د.ع)' },
  document_count: { en: 'Document count', ar: 'عدد المستندات' },
  group_id: { en: 'Group', ar: 'المجموعة' },
  source_type: { en: 'Source type', ar: 'نوع المصدر' },
  document_date: { en: 'Document date', ar: 'تاريخ المستند' },
  accounting_date: { en: 'Accounting date', ar: 'التاريخ المحاسبي' },
  debit_currency: { en: 'Debit (currency)', ar: 'مدين (بالعملة)' },
  credit_currency: { en: 'Credit (currency)', ar: 'دائن (بالعملة)' },
  debit_iqd: { en: 'Debit (IQD)', ar: 'مدين (د.ع)' },
  credit_iqd: { en: 'Credit (IQD)', ar: 'دائن (د.ع)' },
};

@Injectable()
export class ReportExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly reportsPart2: ReportsPart2Service,
    private readonly reportsPart3: ReportsPart3Service,
    private readonly pdf: ReportPdfService,
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
        permissions: [...Object.values(permissions), 'cost.view'],
      };
      const rows = await this.rows(actor, parameters, async (done, total) => {
        await this.prisma.reportExport.update({
          where: { id: exportId },
          data: { rows_done: done, rows_total: total },
        });
      });
      const language = claimed.language === 'ar' ? 'ar' : 'en';
      const extension =
        claimed.format === 'xlsx'
          ? 'xlsx'
          : claimed.format === 'pdf'
            ? 'pdf'
            : 'csv';
      const file =
        extension === 'xlsx'
          ? await this.xlsx(rows, language)
          : extension === 'pdf'
            ? await this.pdf.render(
                await this.pdfPayload(
                  actor,
                  parameters,
                  rows,
                  language,
                  claimed.created_by,
                ),
              )
            : this.csv(rows, language);
      const contentType =
        extension === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : extension === 'pdf'
            ? 'application/pdf'
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
      const perPage = 500;
      let page = 1;
      let total: number;
      const rows: Array<Record<string, unknown>> = [];
      do {
        const report = await this.reports.profitLoss(
          actor,
          {
            from: input.from!,
            to: input.to!,
            page,
            per_page: perPage,
          },
          false,
        );
        total = report.pagination.total;
        rows.push(...report.data);
        await progress(rows.length, total);
        page += 1;
      } while (rows.length < total);
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
                group_by: input.group_by as never,
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
            : input.report_type === 'cash'
              ? await this.reportsPart2.cash(
                  actor,
                  {
                    from: input.from!,
                    to: input.to!,
                    page,
                    per_page: perPage,
                  },
                  false,
                )
              : input.report_type === 'delivery_custody'
                ? await this.reportsPart2.deliveryCustody(
                    actor,
                    { as_of: input.as_of!, page, per_page: perPage },
                    false,
                  )
                : input.report_type === 'liabilities'
                  ? await this.reportsPart2.liabilities(
                      actor,
                      { as_of: input.as_of!, page, per_page: perPage },
                      false,
                    )
                  : input.report_type === 'inventory_valuation'
                    ? await this.reportsPart2.inventoryValuation(
                        actor,
                        {
                          as_of: input.as_of!,
                          slow_days: input.slow_days ?? 90,
                          page,
                          per_page: perPage,
                        },
                        false,
                      )
                    : input.report_type === 'purchases'
                      ? await this.reportsPart3.purchases(
                          actor,
                          {
                            from: input.from!,
                            to: input.to!,
                            group_by: (input.group_by ?? 'period') as never,
                            supplier_id: input.supplier_id,
                            variant_id: input.variant_id,
                            category_id: input.category_id,
                            page,
                            per_page: perPage,
                          },
                          false,
                        )
                      : input.report_type === 'supplier_statement'
                        ? await this.reportsPart3.supplierStatement(
                            actor,
                            {
                              as_of: input.as_of!,
                              supplier_id: input.supplier_id!,
                              page,
                              per_page: perPage,
                            },
                            false,
                          )
                        : input.report_type === 'stock_movement'
                          ? await this.reportsPart3.stockMovement(
                              actor,
                              {
                                from: input.from!,
                                to: input.to!,
                                warehouse_id: input.warehouse_id,
                                variant_id: input.variant_id,
                                page,
                                per_page: perPage,
                              },
                              false,
                            )
                          : input.report_type === 'expenses'
                            ? await this.reportsPart3.expenses(
                                actor,
                                {
                                  from: input.from!,
                                  to: input.to!,
                                  group_by: (input.group_by ??
                                    'category') as never,
                                  category_id: input.category_id,
                                  payee: input.payee,
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

  private async pdfPayload(
    actor: Actor,
    input: CreateReportExportDto,
    rows: Array<Record<string, unknown>>,
    language: 'ar' | 'en',
    creatorId: string,
  ) {
    const [summary, settings, creator, filters] = await Promise.all([
      this.reportSummary(actor, input),
      this.prisma.storeSetting.findMany({
        where: {
          key: {
            in: [
              'store_name',
              'store_legal_name_ar',
              'store_legal_name_en',
              'logo_url',
              'timezone',
            ],
          },
        },
        select: { key: true, value: true },
      }),
      this.prisma.user.findUnique({
        where: { id: creatorId },
        select: { name: true, username: true },
      }),
      this.pdfFilters(input, language),
    ]);
    const values = new Map(
      settings.map((setting) => [setting.key, setting.value]),
    );
    const timezone = values.get('timezone') || 'Asia/Baghdad';
    const storeName =
      values.get(`store_legal_name_${language}`) ||
      values.get('store_name') ||
      'Shubayr';
    const flatRows = rows.map((row) => this.flattenRow(row));
    const keys = flatRows.length
      ? [...new Set(flatRows.flatMap((row) => Object.keys(row)))]
      : ['line'];
    return {
      language,
      orientation: input.orientation ?? 'portrait',
      storeName,
      reportTitle: reportTitles[input.report_type][language],
      exportedBy:
        creator?.name?.trim() ||
        creator?.username?.trim() ||
        (language === 'ar' ? 'مستخدم إداري' : 'Admin user'),
      exportedAt: new Intl.DateTimeFormat(
        language === 'ar' ? 'ar-IQ-u-nu-arab' : 'en-GB',
        {
          timeZone: timezone,
          dateStyle: 'medium',
          timeStyle: 'medium',
        },
      ).format(new Date()),
      filters,
      totals: this.pdfTotals(summary, language),
      columns: keys.map((key) => ({ key, label: this.label(key, language) })),
      rows: flatRows.map((row) =>
        Object.fromEntries(
          keys.map((key) => [
            key,
            this.pdfValue(key, row[key], language, timezone),
          ]),
        ),
      ),
      touchesOpenPeriod: Boolean(summary.touches_open_period),
      logoDataUrl: await this.pdfLogo(values.get('logo_url') ?? undefined),
    };
  }

  private async reportSummary(
    actor: Actor,
    input: CreateReportExportDto,
  ): Promise<Record<string, unknown>> {
    const page = 1;
    const per_page = 1;
    const report =
      input.report_type === 'sales'
        ? await this.reports.sales(
            actor,
            {
              from: input.from!,
              to: input.to!,
              group_by: input.group_by as never,
              page,
              per_page,
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
                per_page,
              },
              false,
            )
          : input.report_type === 'profit_loss'
            ? await this.reports.profitLoss(
                actor,
                { from: input.from!, to: input.to!, page, per_page },
                false,
              )
            : input.report_type === 'cash'
              ? await this.reportsPart2.cash(
                  actor,
                  { from: input.from!, to: input.to!, page, per_page },
                  false,
                )
              : input.report_type === 'delivery_custody'
                ? await this.reportsPart2.deliveryCustody(
                    actor,
                    { as_of: input.as_of!, page, per_page },
                    false,
                  )
                : input.report_type === 'liabilities'
                  ? await this.reportsPart2.liabilities(
                      actor,
                      { as_of: input.as_of!, page, per_page },
                      false,
                    )
                  : input.report_type === 'inventory_valuation'
                    ? await this.reportsPart2.inventoryValuation(
                        actor,
                        {
                          as_of: input.as_of!,
                          slow_days: input.slow_days ?? 90,
                          page,
                          per_page,
                        },
                        false,
                      )
                    : input.report_type === 'purchases'
                      ? await this.reportsPart3.purchases(
                          actor,
                          {
                            from: input.from!,
                            to: input.to!,
                            group_by: (input.group_by ?? 'period') as never,
                            supplier_id: input.supplier_id,
                            variant_id: input.variant_id,
                            category_id: input.category_id,
                            page,
                            per_page,
                          },
                          false,
                        )
                      : input.report_type === 'supplier_statement'
                        ? await this.reportsPart3.supplierStatement(
                            actor,
                            {
                              as_of: input.as_of!,
                              supplier_id: input.supplier_id!,
                              page,
                              per_page,
                            },
                            false,
                          )
                        : input.report_type === 'stock_movement'
                          ? await this.reportsPart3.stockMovement(
                              actor,
                              {
                                from: input.from!,
                                to: input.to!,
                                warehouse_id: input.warehouse_id,
                                variant_id: input.variant_id,
                                page,
                                per_page,
                              },
                              false,
                            )
                          : input.report_type === 'expenses'
                            ? await this.reportsPart3.expenses(
                                actor,
                                {
                                  from: input.from!,
                                  to: input.to!,
                                  group_by: (input.group_by ??
                                    'category') as never,
                                  category_id: input.category_id,
                                  payee: input.payee,
                                  page,
                                  per_page,
                                },
                                false,
                              )
                            : input.report_type === 'trial_balance'
                              ? await this.reports.trialBalance(actor, {
                                  as_of: input.as_of!,
                                  page,
                                  per_page,
                                })
                              : await this.reports.balanceSheet(actor, {
                                  as_of: input.as_of!,
                                  page,
                                  per_page,
                                });
    return report;
  }

  private async pdfFilters(
    input: CreateReportExportDto,
    language: 'ar' | 'en',
  ): Promise<PdfLabelValue[]> {
    const [supplier, variant, category, warehouse] = await Promise.all([
      input.supplier_id
        ? this.prisma.supplier.findUnique({
            where: { id: input.supplier_id },
            select: { name: true },
          })
        : null,
      input.variant_id
        ? this.prisma.productVariant.findUnique({
            where: { id: input.variant_id },
            select: {
              sku: true,
              product: { select: { name_ar: true, name_en: true } },
            },
          })
        : null,
      input.category_id
        ? this.prisma.category.findUnique({
            where: { id: input.category_id },
            select: { name_ar: true, name_en: true },
          })
        : null,
      input.warehouse_id
        ? this.prisma.warehouse.findUnique({
            where: { id: input.warehouse_id },
            select: { name: true, code: true },
          })
        : null,
    ]);
    const ar = language === 'ar';
    const entries: PdfLabelValue[] = [];
    if (input.from)
      entries.push({ label: ar ? 'من تاريخ' : 'From', value: input.from });
    if (input.to)
      entries.push({ label: ar ? 'إلى تاريخ' : 'To', value: input.to });
    if (input.as_of)
      entries.push({ label: ar ? 'كما في' : 'As of', value: input.as_of });
    const group = input.group_by ?? this.defaultGroup(input.report_type);
    if (group) {
      entries.push({
        label: ar ? 'التجميع' : 'Grouping',
        value: this.groupLabel(group, language),
      });
    }
    if (input.slow_days !== undefined) {
      entries.push({
        label: ar ? 'حد بطء الحركة' : 'Slow-moving threshold',
        value: ar ? `${input.slow_days} يوم` : `${input.slow_days} days`,
      });
    }
    if (input.supplier_id) {
      entries.push({
        label: ar ? 'المورد' : 'Supplier',
        value:
          supplier?.name ?? (ar ? 'مورد غير متاح' : 'Unavailable supplier'),
      });
    }
    if (input.variant_id) {
      const name = variant?.product[`name_${language}`];
      entries.push({
        label: ar ? 'الصنف' : 'SKU',
        value: variant
          ? `${variant.sku} — ${name}`
          : ar
            ? 'صنف غير متاح'
            : 'Unavailable SKU',
      });
    }
    if (input.category_id) {
      entries.push({
        label: ar ? 'الفئة' : 'Category',
        value:
          category?.[`name_${language}`] ??
          (ar ? 'فئة غير متاحة' : 'Unavailable category'),
      });
    }
    if (input.warehouse_id) {
      entries.push({
        label: ar ? 'المخزن' : 'Warehouse',
        value: warehouse
          ? `${warehouse.name} (${warehouse.code})`
          : ar
            ? 'مخزن غير متاح'
            : 'Unavailable warehouse',
      });
    }
    if (input.payee) {
      entries.push({ label: ar ? 'المستفيد' : 'Payee', value: input.payee });
    }
    return entries;
  }

  private pdfTotals(
    summary: Record<string, unknown>,
    language: 'ar' | 'en',
  ): PdfLabelValue[] {
    let totals = summary.totals;
    if (!totals && 'debit_total' in summary) {
      totals = {
        debit: summary.debit_total,
        credit: summary.credit_total,
        balanced: summary.balanced,
      };
    }
    if (!totals && summary.current && summary.previous) {
      totals = {
        current: this.withoutArrays(summary.current),
        previous: this.withoutArrays(summary.previous),
      };
    }
    if (!totals || typeof totals !== 'object') return [];
    const entries: PdfLabelValue[] = [];
    this.flattenTotals(totals as Record<string, unknown>, language, entries);
    return entries;
  }

  private flattenTotals(
    value: Record<string, unknown>,
    language: 'ar' | 'en',
    result: PdfLabelValue[],
    prefix?: string,
  ) {
    for (const [key, entry] of Object.entries(value)) {
      if (entry === null || entry === undefined || Array.isArray(entry))
        continue;
      const label = this.label(key, language);
      const fullLabel = prefix ? `${prefix} — ${label}` : label;
      if (typeof entry === 'object') {
        this.flattenTotals(
          entry as Record<string, unknown>,
          language,
          result,
          fullLabel,
        );
      } else {
        result.push({
          label: fullLabel,
          value: this.pdfValue(key, entry, language, 'Asia/Baghdad'),
        });
      }
    }
  }

  private withoutArrays(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => !Array.isArray(entry)),
    );
  }

  private async pdfLogo(url?: string) {
    if (!url) return undefined;
    try {
      const media = await this.prisma.mediaObject.findFirst({
        where: { public_url: url, deleted_at: null },
        select: { object_key: true },
      });
      if (!media) return undefined;
      const png = await sharp(await this.storage.get(media.object_key))
        .rotate()
        .resize(180, 180, { fit: 'contain', withoutEnlargement: true })
        .png()
        .toBuffer();
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch {
      return undefined;
    }
  }

  private label(key: string, language: 'ar' | 'en') {
    const direct = labels[key]?.[language] ?? labels[key]?.en;
    if (direct) return direct;
    const parts = key.split('.');
    if (parts.length > 1) {
      return parts
        .map(
          (part) =>
            labels[part]?.[language] ?? labels[part]?.en ?? this.humanize(part),
        )
        .join(' — ');
    }
    return this.humanize(key);
  }

  private flattenRow(
    value: Record<string, unknown>,
    prefix = '',
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (
        entry &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        !(entry instanceof Date)
      ) {
        Object.assign(
          result,
          this.flattenRow(entry as Record<string, unknown>, path),
        );
      } else {
        result[path] = entry;
      }
    }
    return result;
  }

  private humanize(key: string) {
    return key
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private pdfValue(
    key: string,
    value: unknown,
    language: 'ar' | 'en',
    timezone: string,
  ): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') {
      return value
        ? language === 'ar'
          ? 'نعم'
          : 'Yes'
        : language === 'ar'
          ? 'لا'
          : 'No';
    }
    if (typeof value === 'object') return JSON.stringify(value) ?? '';
    const text =
      typeof value === 'string' || typeof value === 'number'
        ? value.toString()
        : typeof value === 'bigint'
          ? value.toString()
          : (JSON.stringify(value) ?? '');
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
      const instant = new Date(text);
      if (!Number.isNaN(instant.getTime())) {
        return new Intl.DateTimeFormat(
          language === 'ar' ? 'ar-IQ-u-nu-arab' : 'en-GB',
          { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' },
        ).format(instant);
      }
    }
    if (/^-?\d+(?:\.\d+)?$/.test(text)) {
      const formatted = this.exactNumber(text, language);
      return this.moneyKey(key)
        ? `${formatted} ${language === 'ar' ? 'د.ع' : 'IQD'}`
        : formatted;
    }
    return text;
  }

  private exactNumber(value: string, language: 'ar' | 'en') {
    const negative = value.startsWith('-');
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ''] = unsigned.split('.');
    const grouped = BigInt(whole || '0').toLocaleString(
      language === 'ar' ? 'ar-IQ-u-nu-arab' : 'en-US',
    );
    const trimmed = fraction.replace(/0+$/, '');
    if (!trimmed) return `${negative ? '-' : ''}${grouped}`;
    const digits =
      language === 'ar'
        ? trimmed.replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)])
        : trimmed;
    return `${negative ? '-' : ''}${grouped}${language === 'ar' ? '٫' : '.'}${digits}`;
  }

  private moneyKey(key: string) {
    return (
      /(amount|cost|sales|discount|return|balance|value|revenue|profit|fee|inflow|outflow|asset|liabilit|equity|expense|payment|credit|debit|cash)/.test(
        key,
      ) && !/(count|quantity|percent|age_days)/.test(key)
    );
  }

  private defaultGroup(type: ExportType) {
    if (type === 'sales') return 'day';
    if (type === 'profitability') return 'product';
    if (type === 'purchases') return 'period';
    if (type === 'expenses') return 'category';
    return undefined;
  }

  private groupLabel(group: string, language: 'ar' | 'en') {
    const groups: Record<string, { ar: string; en: string }> = {
      day: { ar: 'يوم', en: 'Day' },
      week: { ar: 'أسبوع', en: 'Week' },
      month: { ar: 'شهر', en: 'Month' },
      department: { ar: 'قسم', en: 'Department' },
      category: { ar: 'فئة', en: 'Category' },
      brand: { ar: 'علامة تجارية', en: 'Brand' },
      product: { ar: 'منتج', en: 'Product' },
      sku: { ar: 'صنف', en: 'SKU' },
      period: { ar: 'فترة', en: 'Period' },
      supplier: { ar: 'مورد', en: 'Supplier' },
      payee: { ar: 'مستفيد', en: 'Payee' },
    };
    return groups[group]?.[language] ?? this.humanize(group);
  }

  private validateDates(input: CreateReportExportDto) {
    const period = [
      'sales',
      'profitability',
      'profit_loss',
      'cash',
      'purchases',
      'stock_movement',
      'expenses',
    ].includes(input.report_type);
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
    if (input.report_type === 'supplier_statement' && !input.supplier_id) {
      throw new UnprocessableEntityException({
        status: 422,
        code: 'REPORT_EXPORT_PARAMETERS_INVALID',
        message: 'supplier_id is required for a supplier statement',
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
    if (
      ['inventory_valuation', 'purchases', 'stock_movement'].includes(type) &&
      !actor.permissions.includes('cost.view')
    ) {
      throw new ForbiddenException({
        status: 403,
        code: 'PERMISSION_DENIED',
        message: 'Missing permission: cost.view',
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
