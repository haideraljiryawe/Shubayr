import ExcelJS from 'exceljs';
import {
  PRODUCT_SHEET,
  STOCK_SHEET,
  buildTemplate,
  loadWorkbook,
  parseProducts,
  parseStock,
  productColumns,
  workbookRowCount,
} from './catalog-import.xlsx';

describe('catalog import workbook', () => {
  it('builds a bilingual template with instructions and valid examples', async () => {
    const workbook = await loadWorkbook(await buildTemplate());
    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      'Instructions - التعليمات',
      PRODUCT_SHEET,
      STOCK_SHEET,
    ]);
    expect(parseProducts(workbook)).toHaveLength(2);
    expect(parseStock(workbook)).toHaveLength(1);
    expect(workbookRowCount(workbook)).toBe(3);
    expect(
      workbook.getWorksheet(PRODUCT_SHEET)?.getRow(1).getCell(1).text,
    ).toContain('القسم');
  });

  it('reports every malformed value with an exact cell reference', async () => {
    const workbook = await loadWorkbook(await buildTemplate());
    const sheet = workbook.getWorksheet(PRODUCT_SHEET)!;
    sheet.getCell('H2').value = '';
    sheet.getCell('L2').value = '12.5';
    const [parsed] = parseProducts(workbook);
    expect(parsed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'REQUIRED',
          cell: `${PRODUCT_SHEET}!H2`,
        }),
        expect.objectContaining({
          code: 'PRICE_INVALID',
          cell: `${PRODUCT_SHEET}!L2`,
        }),
      ]),
    );
  });

  it('parses 5,000 rows within the large-file budget', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(PRODUCT_SHEET);
    sheet.columns = productColumns.map(([key, header]) => ({ key, header }));
    for (let index = 0; index < 5_000; index += 1) {
      sheet.addRow({
        category_level_1: 'Department | قسم',
        category_level_2: 'Category | فئة',
        product_name_ar: `منتج ${index}`,
        product_name_en: `Product ${index}`,
        sku: `PERF-${index}`,
        base_unit: 'piece',
        whole_units_only: 'yes',
        price_iqd: 1_000,
        status: 'hidden',
      });
    }
    const started = performance.now();
    const rows = parseProducts(workbook);
    const elapsed = performance.now() - started;
    expect(rows).toHaveLength(5_000);
    expect(elapsed).toBeLessThan(3_000);
  });
});
