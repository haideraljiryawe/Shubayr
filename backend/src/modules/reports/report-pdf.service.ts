import { Injectable } from '@nestjs/common';
import pdfmake from '@digicole/pdfmake-rtl';
import cairoFonts from '@digicole/pdfmake-rtl/fonts/Cairo';

type Language = 'ar' | 'en';
type Orientation = 'portrait' | 'landscape';

export type PdfLabelValue = { label: string; value: string };

export type PdfReportPayload = {
  language: Language;
  orientation: Orientation;
  storeName: string;
  reportTitle: string;
  exportedBy: string;
  exportedAt: string;
  filters: PdfLabelValue[];
  totals: PdfLabelValue[];
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
  touchesOpenPeriod: boolean;
  logoDataUrl?: string;
};

type PdfNode = Record<string, unknown>;

pdfmake.addFonts(cairoFonts);

@Injectable()
export class ReportPdfService {
  async render(payload: PdfReportPayload): Promise<Buffer> {
    const output = pdfmake.createPdf(this.definition(payload));
    return Buffer.from(await output.getBuffer());
  }

  definition(payload: PdfReportPayload): Record<string, unknown> {
    const ar = payload.language === 'ar';
    const align = ar ? 'right' : 'left';
    const content: PdfNode[] = [
      this.identity(payload, align),
      {
        text: payload.reportTitle,
        style: 'title',
        alignment: align,
        margin: [0, 8, 0, 10],
      },
      this.metadata(payload, align),
    ];

    if (payload.filters.length > 0) {
      content.push(
        this.sectionHeading(
          ar ? 'عوامل التصفية المطبقة' : 'Applied filters',
          align,
        ),
        this.labelValueTable(payload.filters, ar),
      );
    }
    if (payload.touchesOpenPeriod) {
      content.push({
        text: ar
          ? 'تنبيه: تشمل الفترة فترة محاسبية مفتوحة، لذلك قد تتغير الأرقام حتى الإغلاق.'
          : 'Notice: this range touches an open accounting period, so figures can change until close.',
        color: '#92400e',
        fillColor: '#fffbeb',
        alignment: align,
        margin: [0, 10, 0, 6],
      });
    }
    if (payload.totals.length > 0) {
      content.push(
        this.sectionHeading(ar ? 'الإجماليات' : 'Totals', align),
        this.labelValueTable(payload.totals, ar),
      );
    }

    content.push(
      this.sectionHeading(
        ar
          ? `البيانات (${payload.rows.length.toLocaleString('ar-IQ')})`
          : `Detail (${payload.rows.length.toLocaleString('en-US')})`,
        align,
      ),
    );
    if (payload.rows.length === 0) {
      content.push({
        text: ar ? 'لا توجد نتائج مطابقة.' : 'No matching results.',
        alignment: align,
        color: '#64748b',
        margin: [0, 6, 0, 0],
      });
    } else {
      const columnGroups = this.columnGroups(
        payload.columns,
        payload.orientation === 'landscape' ? 8 : 5,
      );
      columnGroups.forEach((columns, index) => {
        if (columnGroups.length > 1) {
          content.push({
            text: ar
              ? `الأعمدة ${index + 1} من ${columnGroups.length}`
              : `Columns ${index + 1} of ${columnGroups.length}`,
            alignment: align,
            bold: true,
            fontSize: 8,
            color: '#475569',
            margin: [0, 8, 0, 3],
          });
        }
        content.push(this.dataTable(columns, payload.rows, ar));
      });
    }

    return {
      pageSize: 'A4',
      pageOrientation: payload.orientation,
      pageMargins: [34, 48, 34, 44],
      rtl: ar,
      defaultStyle: {
        font: 'Cairo',
        fontSize: 8,
        alignment: align,
        lineHeight: 1.25,
      },
      info: {
        title: `${payload.storeName} — ${payload.reportTitle}`,
        author: payload.storeName,
        subject: payload.reportTitle,
        creator: 'Shubayr report export',
      },
      header: (currentPage: number) =>
        currentPage === 1
          ? { text: '' }
          : {
              columns: ar
                ? [
                    { text: payload.reportTitle, alignment: 'left' },
                    { text: payload.storeName, alignment: 'right', bold: true },
                  ]
                : [
                    { text: payload.storeName, alignment: 'left', bold: true },
                    { text: payload.reportTitle, alignment: 'right' },
                  ],
              font: 'Cairo',
              fontSize: 8,
              color: '#475569',
              margin: [34, 18, 34, 0],
            },
      footer: (currentPage: number, pageCount: number) => ({
        text: ar
          ? `الصفحة ${currentPage.toLocaleString('ar-IQ')} من ${pageCount.toLocaleString('ar-IQ')}`
          : `Page ${currentPage} of ${pageCount}`,
        alignment: 'center',
        font: 'Cairo',
        fontSize: 8,
        color: '#64748b',
        margin: [0, 10, 0, 0],
      }),
      styles: {
        title: { fontSize: 18, bold: true, color: '#0f172a' },
        section: { fontSize: 11, bold: true, color: '#0f172a' },
      },
      content,
    };
  }

  private identity(payload: PdfReportPayload, align: string): PdfNode {
    const name: PdfNode = {
      text: payload.storeName,
      bold: true,
      fontSize: 13,
      alignment: align,
      margin: payload.logoDataUrl ? [8, 8, 0, 0] : [0, 8, 0, 0],
    };
    if (!payload.logoDataUrl) return name;
    return {
      columns:
        payload.language === 'ar'
          ? [name, { image: payload.logoDataUrl, width: 44, height: 44 }]
          : [{ image: payload.logoDataUrl, width: 44, height: 44 }, name],
      columnGap: 8,
    };
  }

  private metadata(payload: PdfReportPayload, align: string): PdfNode {
    const ar = payload.language === 'ar';
    const entries = [
      {
        label: ar ? 'صُدّر بواسطة' : 'Exported by',
        value: payload.exportedBy,
      },
      {
        label: ar ? 'وقت التصدير' : 'Export time',
        value: payload.exportedAt,
      },
      {
        label: ar ? 'اتجاه الصفحة' : 'Orientation',
        value:
          payload.orientation === 'landscape'
            ? ar
              ? 'عرضي'
              : 'Landscape'
            : ar
              ? 'طولي'
              : 'Portrait',
      },
    ];
    return {
      ...this.labelValueTable(entries, ar),
      alignment: align,
      margin: [0, 0, 0, 6],
    };
  }

  private sectionHeading(text: string, alignment: string): PdfNode {
    return { text, style: 'section', alignment, margin: [0, 10, 0, 5] };
  }

  private labelValueTable(entries: PdfLabelValue[], ar: boolean): PdfNode {
    const body = entries.map((entry) => {
      const label = {
        text: entry.label,
        bold: true,
        color: '#334155',
        fillColor: '#f8fafc',
        alignment: ar ? 'right' : 'left',
      };
      const value = {
        text: entry.value,
        alignment: ar ? 'right' : 'left',
      };
      return ar ? [value, label] : [label, value];
    });
    return {
      table: { widths: ['34%', '66%'], body, rtl: ar },
      layout: 'lightHorizontalLines',
    };
  }

  private dataTable(
    columns: Array<{ key: string; label: string }>,
    rows: Array<Record<string, string>>,
    ar: boolean,
  ): PdfNode {
    const header = columns.map((column) => ({
      text: column.label,
      bold: true,
      color: '#ffffff',
      fillColor: '#334155',
      alignment: ar ? 'right' : 'left',
      margin: [2, 3, 2, 3],
    }));
    const body = [
      header,
      ...rows.map((row, rowIndex) =>
        columns.map((column) => ({
          text: row[column.key] ?? '',
          fillColor: rowIndex % 2 === 1 ? '#f8fafc' : '#ffffff',
          alignment: ar ? 'right' : 'left',
          margin: [2, 3, 2, 3],
        })),
      ),
    ];
    return {
      table: {
        headerRows: 1,
        dontBreakRows: true,
        widths: columns.map(() => '*'),
        body,
        rtl: ar,
      },
      layout: 'lightHorizontalLines',
      fontSize: columns.length > 6 ? 6.5 : 7.5,
      margin: [0, 0, 0, 7],
    };
  }

  private columnGroups(
    columns: Array<{ key: string; label: string }>,
    max: number,
  ) {
    if (columns.length <= max) return [columns];
    const identity =
      columns.find((column) =>
        ['key', 'sku', 'code', 'line', 'document_number', 'name'].includes(
          column.key,
        ),
      ) ?? columns[0];
    const remaining = columns.filter((column) => column.key !== identity.key);
    const groups: Array<Array<{ key: string; label: string }>> = [];
    for (let index = 0; index < remaining.length; index += max - 1) {
      groups.push([identity, ...remaining.slice(index, index + max - 1)]);
    }
    return groups;
  }
}
