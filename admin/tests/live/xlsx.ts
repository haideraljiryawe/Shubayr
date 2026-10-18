/* ---------------------------------------------------------------------------
 * Test fixtures for the catalog import: a minimal .xlsx writer and a ZIP
 * writer (stored entries, CRC-32), so the live tests build workbooks and
 * picture archives without a spreadsheet or archive dependency.
 *
 * Cells are inline strings, or numbers; the API reads either.
 * ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A ZIP archive of the given files, stored without compression. */
export function zip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, file.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + file.data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

export type Cell = string | number | null | undefined;

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function column(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

function sheetXml(rows: Cell[][]): string {
  const body = rows
    .map((cells, r) => {
      const xml = cells
        .map((value, c) => {
          if (value === null || value === undefined || value === "") return "";
          const ref = `${column(c)}${r + 1}`;
          return typeof value === "number"
            ? `<c r="${ref}"><v>${value}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${xml}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** An .xlsx workbook with the given sheets (first row = headers). */
export function workbook(sheets: Array<{ name: string; rows: Cell[][] }>): Buffer {
  const files = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("")}</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
          .map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("")}</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join("")}</Relationships>`,
      ),
    },
    ...sheets.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(sheet.rows)) })),
  ];
  return zip(files);
}

/* ------------------------------------------------------------ the template's columns */

export const PRODUCT_HEADERS = [
  "Category (level 1) / القسم (المستوى 1)",
  "Subcategory (level 2) / القسم الفرعي (المستوى 2)",
  "Brand / العلامة التجارية",
  "Product name AR / اسم المنتج بالعربية",
  "Product name EN / اسم المنتج بالإنجليزية",
  "Description AR / الوصف بالعربية",
  "Description EN / الوصف بالإنجليزية",
  "SKU / رمز المخزون",
  "Variant attributes / خصائص المتغير",
  "Base unit / الوحدة الأساسية",
  "Whole units only / وحدات كاملة فقط",
  "Price IQD / السعر بالدينار",
  "Linked currency / عملة الربط",
  "Reference price / السعر المرجعي",
  "Low-stock threshold / حد المخزون المنخفض",
  "Barcode / الباركود",
  "Status / الحالة",
  "Image URL 1 / رابط الصورة 1",
  "Image URL 2 / رابط الصورة 2",
  "Image URL 3 / رابط الصورة 3",
] as const;

export const STOCK_HEADERS = [
  "SKU / رمز المخزون",
  "Location code / رمز الموقع",
  "Quantity / الكمية",
  "Unit cost IQD / كلفة الوحدة بالدينار",
  "Expiry YYYY-MM-DD / انتهاء الصلاحية",
] as const;

export interface ProductLine {
  category1: string;
  category2: string;
  brand?: string;
  nameAr: string;
  nameEn: string;
  sku: string;
  price?: number | string;
  attributes?: string;
  unit?: string;
  whole?: string;
  status?: string;
  barcode?: string;
  lowStock?: number;
}

export function productRow(line: ProductLine): Cell[] {
  return [
    line.category1,
    line.category2,
    line.brand ?? "",
    line.nameAr,
    line.nameEn,
    "",
    "",
    line.sku,
    line.attributes ?? "",
    line.unit ?? "piece",
    line.whole ?? "yes",
    line.price ?? "",
    "",
    "",
    line.lowStock ?? "",
    line.barcode ?? "",
    line.status ?? "",
    "",
    "",
    "",
  ];
}

export function catalogWorkbook(products: ProductLine[], stock?: Array<{ sku: string; location: string; quantity: number; cost: number }>): Buffer {
  const sheets: Array<{ name: string; rows: Cell[][] }> = [
    { name: "Products+Variants", rows: [[...PRODUCT_HEADERS], ...products.map(productRow)] },
  ];
  if (stock) {
    sheets.push({ name: "Stock", rows: [[...STOCK_HEADERS], ...stock.map((line) => [line.sku, line.location, line.quantity, line.cost, ""])] });
  }
  return workbook(sheets);
}

/** A tiny valid PNG (1×1), for picture archives. */
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
