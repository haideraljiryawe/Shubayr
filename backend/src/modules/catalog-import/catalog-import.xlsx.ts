import ExcelJS from 'exceljs';
import { UnprocessableEntityException } from '@nestjs/common';
import type {
  ImportIssue,
  ParsedProductRow,
  ParsedStockRow,
} from './catalog-import.types';

export const PRODUCT_SHEET = 'Products+Variants';
export const STOCK_SHEET = 'Stock';

export const productColumns = [
  ['category_level_1', 'Category (level 1) / القسم (المستوى 1)'],
  ['category_level_2', 'Subcategory (level 2) / القسم الفرعي (المستوى 2)'],
  ['brand', 'Brand / العلامة التجارية'],
  ['product_name_ar', 'Product name AR / اسم المنتج بالعربية'],
  ['product_name_en', 'Product name EN / اسم المنتج بالإنجليزية'],
  ['description_ar', 'Description AR / الوصف بالعربية'],
  ['description_en', 'Description EN / الوصف بالإنجليزية'],
  ['sku', 'SKU / رمز المخزون'],
  ['attributes', 'Variant attributes / خصائص المتغير'],
  ['base_unit', 'Base unit / الوحدة الأساسية'],
  ['whole_units_only', 'Whole units only / وحدات كاملة فقط'],
  ['price_iqd', 'Price IQD / السعر بالدينار'],
  ['reference_currency_code', 'Linked currency / عملة الربط'],
  ['reference_price', 'Reference price / السعر المرجعي'],
  ['low_stock_threshold', 'Low-stock threshold / حد المخزون المنخفض'],
  ['barcode', 'Barcode / الباركود'],
  ['status', 'Status / الحالة'],
  ['image_url_1', 'Image URL 1 / رابط الصورة 1'],
  ['image_url_2', 'Image URL 2 / رابط الصورة 2'],
  ['image_url_3', 'Image URL 3 / رابط الصورة 3'],
] as const;

export const stockColumns = [
  ['sku', 'SKU / رمز المخزون'],
  ['location_code', 'Location code / رمز الموقع'],
  ['quantity', 'Quantity / الكمية'],
  ['unit_cost_iqd', 'Unit cost IQD / كلفة الوحدة بالدينار'],
  ['expiry', 'Expiry YYYY-MM-DD / انتهاء الصلاحية'],
] as const;

type ProductKey = (typeof productColumns)[number][0];
type StockKey = (typeof stockColumns)[number][0];

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return text(value.result ?? null);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
  }
  return '';
}

function numberOrNull(value: string): number | null {
  if (!value) return null;
  const normalized = value.replace(/[٬,]/g, '').replace('٫', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (['true', 'yes', '1', 'نعم'].includes(normalized)) return true;
  if (['false', 'no', '0', 'لا'].includes(normalized)) return false;
  return null;
}

function attributes(value: string): Record<string, string> | null {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((item) => typeof item === 'string')
    ) {
      return parsed as Record<string, string>;
    }
  } catch {
    const pairs = value
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
    const result: Record<string, string> = {};
    for (const pair of pairs) {
      const separator = pair.indexOf('=');
      if (separator < 1 || separator === pair.length - 1) return null;
      result[pair.slice(0, separator).trim()] = pair
        .slice(separator + 1)
        .trim();
    }
    if (pairs.length) return result;
  }
  return null;
}

function headerMap<K extends string>(
  sheet: ExcelJS.Worksheet,
  columns: readonly (readonly [K, string])[],
): Map<K, number> {
  const found = new Map<K, number>();
  sheet.getRow(1).eachCell((cell, column) => {
    const header = text(cell.value);
    const match = columns.find(([, label]) => label === header);
    if (match) found.set(match[0], column);
  });
  const missing = columns
    .filter(([key]) => !found.has(key))
    .map(([, label]) => label);
  if (missing.length) {
    throw new UnprocessableEntityException({
      status: 422,
      code: 'CATALOG_IMPORT_HEADERS_INVALID',
      message: `Missing required template columns: ${missing.join(', ')}`,
      errors: [],
    });
  }
  return found;
}

export function cellRef(sheet: string, row: number, column: number): string {
  let value = column;
  let letters = '';
  while (value > 0) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }
  return `${sheet}!${letters}${row}`;
}

function issue(
  severity: 'error' | 'warning',
  code: string,
  sheet: string,
  row: number,
  column: number,
  message: string,
): ImportIssue {
  return { severity, code, cell: cellRef(sheet, row, column), message };
}

export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    // ExcelJS still declares the legacy non-generic Node Buffer type.
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new UnprocessableEntityException({
      status: 422,
      code: 'CATALOG_IMPORT_FILE_INVALID',
      message: 'The uploaded file is not a valid .xlsx workbook',
      errors: [],
    });
  }
  return workbook;
}

export function workbookRowCount(workbook: ExcelJS.Workbook): number {
  const products = workbook.getWorksheet(PRODUCT_SHEET);
  if (!products) return 0;
  const stock = workbook.getWorksheet(STOCK_SHEET);
  return (
    Math.max(0, products.actualRowCount - 1) +
    Math.max(0, (stock?.actualRowCount ?? 1) - 1)
  );
}

export function parseProducts(
  workbook: ExcelJS.Workbook,
): Array<{ row: ParsedProductRow; issues: ImportIssue[] }> {
  const sheet = workbook.getWorksheet(PRODUCT_SHEET);
  if (!sheet) {
    throw new UnprocessableEntityException({
      status: 422,
      code: 'CATALOG_IMPORT_SHEET_REQUIRED',
      message: `${PRODUCT_SHEET} sheet is required`,
      errors: [],
    });
  }
  const columns = headerMap(sheet, productColumns);
  const value = (row: ExcelJS.Row, key: ProductKey) =>
    text(row.getCell(columns.get(key) as number).value);
  const result: Array<{ row: ParsedProductRow; issues: ImportIssue[] }> = [];
  sheet.eachRow((source, rowNumber) => {
    if (rowNumber === 1 || !source.hasValues) return;
    const issues: ImportIssue[] = [];
    const required: ProductKey[] = [
      'category_level_1',
      'category_level_2',
      'product_name_ar',
      'product_name_en',
      'sku',
      'base_unit',
    ];
    for (const key of required) {
      if (!value(source, key)) {
        issues.push(
          issue(
            'error',
            'REQUIRED',
            PRODUCT_SHEET,
            rowNumber,
            columns.get(key) as number,
            'A value is required',
          ),
        );
      }
    }
    const attr = attributes(value(source, 'attributes'));
    if (attr === null) {
      issues.push(
        issue(
          'error',
          'ATTRIBUTES_INVALID',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('attributes') as number,
          'Use JSON or key=value pairs separated by semicolons',
        ),
      );
    }
    const whole = booleanValue(value(source, 'whole_units_only'));
    if (whole === null) {
      issues.push(
        issue(
          'error',
          'BOOLEAN_INVALID',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('whole_units_only') as number,
          'Use yes/no, true/false, 1/0, or نعم/لا',
        ),
      );
    }
    const priceText = value(source, 'price_iqd');
    const currency = value(source, 'reference_currency_code').toUpperCase();
    const referenceText = value(source, 'reference_price');
    const price = numberOrNull(priceText);
    const reference = numberOrNull(referenceText);
    if (
      (!priceText || price === null) &&
      (!currency || !referenceText || reference === null)
    ) {
      issues.push(
        issue(
          'error',
          'PRICE_REQUIRED',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('price_iqd') as number,
          'Set a whole-IQD price or linked currency and reference price',
        ),
      );
    }
    if (price !== null && (!Number.isInteger(price) || price < 0)) {
      issues.push(
        issue(
          'error',
          'PRICE_INVALID',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('price_iqd') as number,
          'IQD price must be a non-negative whole number',
        ),
      );
    }
    if (currency && !/^[A-Z]{3}$/.test(currency)) {
      issues.push(
        issue(
          'error',
          'CURRENCY_INVALID',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('reference_currency_code') as number,
          'Currency must be a three-letter ISO code',
        ),
      );
    }
    if (referenceText && (reference === null || reference <= 0)) {
      issues.push(
        issue(
          'error',
          'REFERENCE_PRICE_INVALID',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('reference_price') as number,
          'Reference price must be greater than zero',
        ),
      );
    }
    const thresholdText = value(source, 'low_stock_threshold');
    const threshold = numberOrNull(thresholdText);
    if (
      thresholdText &&
      (threshold === null ||
        threshold < 0 ||
        Math.round(threshold * 1000) !== threshold * 1000)
    ) {
      issues.push(
        issue(
          'error',
          'LOW_STOCK_INVALID',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('low_stock_threshold') as number,
          'Threshold must be non-negative with at most three decimals',
        ),
      );
    }
    const statusText = value(source, 'status').toLowerCase();
    const status = statusText || null;
    if (status && !['active', 'hidden', 'archived'].includes(status)) {
      issues.push(
        issue(
          'error',
          'STATUS_INVALID',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('status') as number,
          'Status must be active, hidden, or archived',
        ),
      );
    }
    if (!status) {
      issues.push(
        issue(
          'warning',
          'STATUS_DEFAULTED',
          PRODUCT_SHEET,
          rowNumber,
          columns.get('status') as number,
          'New products default to hidden; existing products keep their status',
        ),
      );
    }
    result.push({
      row: {
        sheet: PRODUCT_SHEET,
        row: rowNumber,
        category_level_1: value(source, 'category_level_1'),
        category_level_2: value(source, 'category_level_2'),
        brand: value(source, 'brand') || null,
        product_name_ar: value(source, 'product_name_ar'),
        product_name_en: value(source, 'product_name_en'),
        description_ar: value(source, 'description_ar') || null,
        description_en: value(source, 'description_en') || null,
        sku: value(source, 'sku').trim(),
        attributes: attr ?? {},
        base_unit: value(source, 'base_unit').trim(),
        whole_units_only: whole ?? true,
        price_iqd: price,
        reference_currency_code: currency || null,
        reference_price: reference,
        low_stock_threshold: threshold,
        barcode: value(source, 'barcode') || null,
        status: ['active', 'hidden', 'archived'].includes(status ?? '')
          ? (status as ParsedProductRow['status'])
          : null,
        image_urls: ['image_url_1', 'image_url_2', 'image_url_3']
          .map((key) => value(source, key as ProductKey))
          .filter(Boolean),
      },
      issues,
    });
  });
  return result;
}

export function parseStock(
  workbook: ExcelJS.Workbook,
): Array<{ row: ParsedStockRow; issues: ImportIssue[] }> {
  const sheet = workbook.getWorksheet(STOCK_SHEET);
  if (!sheet) return [];
  const columns = headerMap(sheet, stockColumns);
  const value = (row: ExcelJS.Row, key: StockKey) =>
    text(row.getCell(columns.get(key) as number).value);
  const result: Array<{ row: ParsedStockRow; issues: ImportIssue[] }> = [];
  sheet.eachRow((source, rowNumber) => {
    if (rowNumber === 1 || !source.hasValues) return;
    const issues: ImportIssue[] = [];
    for (const key of [
      'sku',
      'location_code',
      'quantity',
      'unit_cost_iqd',
    ] as StockKey[]) {
      if (!value(source, key))
        issues.push(
          issue(
            'error',
            'REQUIRED',
            STOCK_SHEET,
            rowNumber,
            columns.get(key) as number,
            'A value is required',
          ),
        );
    }
    const quantity = numberOrNull(value(source, 'quantity'));
    if (
      quantity === null ||
      quantity <= 0 ||
      Math.round(quantity * 1000) !== quantity * 1000
    ) {
      issues.push(
        issue(
          'error',
          'QUANTITY_INVALID',
          STOCK_SHEET,
          rowNumber,
          columns.get('quantity') as number,
          'Quantity must be positive with at most three decimals',
        ),
      );
    }
    const cost = numberOrNull(value(source, 'unit_cost_iqd'));
    if (cost === null || cost < 0) {
      issues.push(
        issue(
          'error',
          'UNIT_COST_INVALID',
          STOCK_SHEET,
          rowNumber,
          columns.get('unit_cost_iqd') as number,
          'Unit cost must be non-negative',
        ),
      );
    }
    const expiry = value(source, 'expiry');
    if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      issues.push(
        issue(
          'error',
          'EXPIRY_INVALID',
          STOCK_SHEET,
          rowNumber,
          columns.get('expiry') as number,
          'Use YYYY-MM-DD',
        ),
      );
    }
    result.push({
      row: {
        sheet: STOCK_SHEET,
        row: rowNumber,
        sku: value(source, 'sku'),
        location_code: value(source, 'location_code').toUpperCase(),
        quantity:
          quantity === null ? value(source, 'quantity') : String(quantity),
        unit_cost_iqd:
          cost === null ? value(source, 'unit_cost_iqd') : String(cost),
        expiry: expiry || null,
      },
      issues,
    });
  });
  return result;
}

export async function buildTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Shubayr';
  const instructions = workbook.addWorksheet('Instructions - التعليمات');
  instructions.columns = [{ width: 120 }];
  [
    'Shubayr catalog import / استيراد كتالوج شبير',
    'Do not rename sheets or headers. Preview validates every row before anything is written.',
    'لا تغيّر أسماء الأوراق أو العناوين. تتم معاينة كل صف والتحقق منه قبل كتابة أي بيانات.',
    'Use Category and Subcategory for exactly two levels. Missing values are created only when “create missing” is selected.',
    'استخدم القسم والقسم الفرعي لمستويين فقط. لا تُنشأ القيم المفقودة إلا عند اختيار «إنشاء المفقود».',
    'Variant attributes: JSON such as {"color":"black","size":"L"}, or color=black;size=L.',
    'For linked pricing, leave Price IQD blank and provide Linked currency plus Reference price.',
    'Stock is optional. All Stock rows become one posted opening-balance document when the import commits.',
    'Image URLs are downloaded, resized and stored by Shubayr only when the import commits.',
    'Maximum: 5,000 data rows across both sheets.',
  ].forEach((line) => instructions.addRow([line]));
  const products = workbook.addWorksheet(PRODUCT_SHEET);
  products.columns = productColumns.map(([key, header]) => ({
    key,
    header,
    width: 26,
  }));
  products.addRow({
    category_level_1: 'Electronics | إلكترونيات',
    category_level_2: 'Headphones | سماعات',
    brand: 'Shubayr | شبير',
    product_name_ar: 'سماعة لاسلكية',
    product_name_en: 'Wireless Headphones',
    description_ar: 'مثال مخفي',
    description_en: 'Hidden example product',
    sku: 'EXAMPLE-HEADPHONE-BLK',
    attributes: 'color=black;size=standard',
    base_unit: 'piece',
    whole_units_only: 'yes',
    price_iqd: 45000,
    low_stock_threshold: 5,
    barcode: '1234567890123',
    status: 'hidden',
  });
  products.addRow({
    category_level_1: 'Electronics | إلكترونيات',
    category_level_2: 'Headphones | سماعات',
    brand: 'Shubayr | شبير',
    product_name_ar: 'سماعة لاسلكية',
    product_name_en: 'Wireless Headphones',
    sku: 'EXAMPLE-HEADPHONE-WHT',
    attributes: '{"color":"white","size":"standard"}',
    base_unit: 'piece',
    whole_units_only: 'yes',
    reference_currency_code: 'USD',
    reference_price: 30,
    status: 'hidden',
  });
  const stock = workbook.addWorksheet(STOCK_SHEET);
  stock.columns = stockColumns.map(([key, header]) => ({
    key,
    header,
    width: 28,
  }));
  stock.addRow({
    sku: 'EXAMPLE-HEADPHONE-BLK',
    location_code: 'MAIN',
    quantity: 10,
    unit_cost_iqd: 30000,
  });
  for (const sheet of [products, stock]) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = {
      from: 'A1',
      to: cellRef('', 1, sheet.getRow(1).cellCount).replace('!', ''),
    };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
