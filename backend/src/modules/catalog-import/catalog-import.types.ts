export type ImportSeverity = 'error' | 'warning';
export type ImportAction = 'create' | 'update' | 'error' | 'warning';

export type ImportIssue = {
  severity: ImportSeverity;
  code: string;
  cell: string;
  message: string;
};

export type ParsedProductRow = {
  sheet: 'Products+Variants';
  row: number;
  category_level_1: string;
  category_level_2: string;
  brand: string | null;
  product_name_ar: string;
  product_name_en: string;
  description_ar: string | null;
  description_en: string | null;
  sku: string;
  attributes: Record<string, string>;
  base_unit: string;
  whole_units_only: boolean;
  price_iqd: number | null;
  reference_currency_code: string | null;
  reference_price: number | null;
  low_stock_threshold: number | null;
  barcode: string | null;
  status: 'active' | 'hidden' | 'archived' | null;
  image_urls: string[];
};

export type ParsedStockRow = {
  sheet: 'Stock';
  row: number;
  sku: string;
  location_code: string;
  quantity: string;
  unit_cost_iqd: string;
  expiry: string | null;
};

export type ImportPreviewRow = {
  sheet: 'Products+Variants' | 'Stock';
  row: number;
  sku: string | null;
  action: ImportAction;
  apply_action: 'create' | 'update' | null;
  issues: ImportIssue[];
  product?: ParsedProductRow;
  stock?: ParsedStockRow;
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  counts: {
    total: number;
    create: number;
    update: number;
    error: number;
    warning: number;
  };
};
