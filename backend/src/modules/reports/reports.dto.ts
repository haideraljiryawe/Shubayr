import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SALES_GROUPS = [
  'day',
  'week',
  'month',
  'department',
  'category',
  'brand',
  'product',
  'sku',
] as const;
const PROFIT_GROUPS = ['department', 'category', 'product', 'sku'] as const;

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  per_page?: number;
  @IsOptional()
  @IsIn(['group', 'gross_sales', 'net_sales', 'order_count'])
  sort?: 'group' | 'gross_sales' | 'net_sales' | 'order_count';
  @IsOptional() @IsIn(['asc', 'desc']) direction?: 'asc' | 'desc';
}

export class SalesReportQueryDto extends PageQueryDto {
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @IsOptional() @IsIn(SALES_GROUPS) group_by?: (typeof SALES_GROUPS)[number];
}

export class ProfitabilityReportQueryDto extends PageQueryDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
  @IsOptional()
  @IsIn(PROFIT_GROUPS)
  group_by?: (typeof PROFIT_GROUPS)[number];
}

export class ProfitLossQueryDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  per_page?: number;
}

const PICKER_REPORTS = [
  'sales',
  'profitability',
  'purchases',
  'stock_movement',
  'inventory_valuation',
] as const;

export class ReportCatalogPickerQueryDto {
  @IsIn(PICKER_REPORTS)
  report_type!: (typeof PICKER_REPORTS)[number];
  @IsIn(['category', 'sku']) kind!: 'category' | 'sku';
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
}

export class AsOfReportQueryDto extends PageQueryDto {
  @Matches(DATE) as_of!: string;
}

export class PeriodReportQueryDto extends PageQueryDto {
  @Matches(DATE) from!: string;
  @Matches(DATE) to!: string;
}

export class InventoryValuationQueryDto extends AsOfReportQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  slow_days = 90;
}

export class PurchasesReportQueryDto extends PeriodReportQueryDto {
  @IsOptional()
  @IsIn(['period', 'supplier', 'sku', 'category'])
  group_by?: 'period' | 'supplier' | 'sku' | 'category';
  @IsOptional() @IsUUID() supplier_id?: string;
  @IsOptional() @IsUUID() variant_id?: string;
  @IsOptional() @IsUUID() category_id?: string;
}

export class SupplierStatementQueryDto extends AsOfReportQueryDto {
  @IsUUID() supplier_id!: string;
}

export class StockMovementReportQueryDto extends PeriodReportQueryDto {
  @IsOptional() @IsUUID() warehouse_id?: string;
  @IsOptional() @IsUUID() variant_id?: string;
}

export class ExpenseReportQueryDto extends PeriodReportQueryDto {
  @IsOptional()
  @IsIn(['category', 'payee', 'month'])
  group_by?: 'category' | 'payee' | 'month';
  @IsOptional() @IsUUID() category_id?: string;
  @IsOptional() @IsString() @MaxLength(200) payee?: string;
}

export class CreateReportExportDto {
  @IsIn([
    'sales',
    'profitability',
    'profit_loss',
    'trial_balance',
    'balance_sheet',
    'cash',
    'delivery_custody',
    'liabilities',
    'inventory_valuation',
    'purchases',
    'supplier_statement',
    'stock_movement',
    'expenses',
  ])
  report_type!:
    | 'sales'
    | 'profitability'
    | 'profit_loss'
    | 'trial_balance'
    | 'balance_sheet'
    | 'cash'
    | 'delivery_custody'
    | 'liabilities'
    | 'inventory_valuation'
    | 'purchases'
    | 'supplier_statement'
    | 'stock_movement'
    | 'expenses';

  @IsIn(['csv', 'xlsx', 'pdf']) format!: 'csv' | 'xlsx' | 'pdf';
  @IsOptional() @IsIn(['ar', 'en']) language?: 'ar' | 'en';
  @IsOptional()
  @IsIn(['portrait', 'landscape'])
  orientation?: 'portrait' | 'landscape';
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @IsOptional() @Matches(DATE) as_of?: string;
  @IsOptional()
  @IsIn([...SALES_GROUPS, 'period', 'supplier', 'payee'])
  group_by?: (typeof SALES_GROUPS)[number] | 'period' | 'supplier' | 'payee';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  slow_days?: number;

  @IsOptional() @IsUUID() supplier_id?: string;
  @IsOptional() @IsUUID() variant_id?: string;
  @IsOptional() @IsUUID() category_id?: string;
  @IsOptional() @IsUUID() warehouse_id?: string;
  @IsOptional() @IsString() @MaxLength(200) payee?: string;
}

export type SalesGroup = NonNullable<SalesReportQueryDto['group_by']>;
export type ProfitGroup = NonNullable<ProfitabilityReportQueryDto['group_by']>;
