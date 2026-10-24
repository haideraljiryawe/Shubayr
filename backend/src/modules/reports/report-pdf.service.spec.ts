import { ReportPdfService, type PdfReportPayload } from './report-pdf.service';

function payload(overrides: Partial<PdfReportPayload> = {}): PdfReportPayload {
  return {
    language: 'ar',
    orientation: 'landscape',
    storeName: 'متجر شُبير',
    reportTitle: 'تقرير المبيعات',
    exportedBy: 'مدير المتجر',
    exportedAt: '٢٤/١٠/٢٠٢٦، ١٠:٣٠:٠٠ ص',
    filters: [{ label: 'من تاريخ', value: '2026-10-01' }],
    totals: [{ label: 'صافي المبيعات', value: '١٬٢٥٠ د.ع' }],
    columns: [
      { key: 'sku', label: 'رمز الصنف' },
      ...Array.from({ length: 9 }, (_, index) => ({
        key: `field_${index}`,
        label: `الحقل ${index}`,
      })),
    ],
    rows: [
      {
        sku: 'SKU-AR-1',
        field_0: 'منتج عربي طويل يلتف داخل الخلية ولا يُقص',
        field_1: '1000',
      },
    ],
    touchesOpenPeriod: true,
    ...overrides,
  };
}

describe('ReportPdfService', () => {
  const service = new ReportPdfService();

  it('builds a bilingual RTL definition with repeated headers and column re-layout', () => {
    const definition = service.definition(payload()) as {
      pageOrientation: string;
      rtl: boolean;
      defaultStyle: { font: string; alignment: string };
      content: Array<Record<string, unknown>>;
      footer: (page: number, pages: number) => { text: string };
    };

    expect(definition.pageOrientation).toBe('landscape');
    expect(definition.rtl).toBe(true);
    expect(definition.defaultStyle).toEqual(
      expect.objectContaining({ font: 'Cairo', alignment: 'right' }),
    );
    expect(definition.footer(2, 7).text).toContain('الصفحة');

    const tables = definition.content
      .map((node) => node.table as Record<string, unknown> | undefined)
      .filter((table): table is Record<string, unknown> =>
        Boolean(table && table.headerRows === 1),
      );
    expect(tables).toHaveLength(2);
    expect(tables.every((table) => table.dontBreakRows === true)).toBe(true);
    expect(
      tables.every((table) => (table.widths as unknown[]).length <= 8),
    ).toBe(true);

    const renderedHeaders = tables.flatMap((table) =>
      ((table.body as Array<Array<{ text: string }>>)[0] ?? []).map(
        (cell) => cell.text,
      ),
    );
    expect(
      renderedHeaders.filter((label) => label === 'رمز الصنف'),
    ).toHaveLength(2);
    expect(renderedHeaders).toEqual(
      expect.arrayContaining(['الحقل 0', 'الحقل 8']),
    );
    expect(JSON.stringify(definition.content)).toContain('فترة محاسبية مفتوحة');
  });

  it('renders selectable Arabic text into a real PDF buffer', async () => {
    const file = await service.render(
      payload({
        columns: [{ key: 'name', label: 'الاسم' }],
        rows: [{ name: 'منتج تجريبي' }],
      }),
    );

    expect(file.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(file.length).toBeGreaterThan(2_000);
  });
});
