import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

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
}

export class AsOfReportQueryDto extends PageQueryDto {
  @Matches(DATE) as_of!: string;
}

export class CreateReportExportDto {
  @IsIn([
    'sales',
    'profitability',
    'profit_loss',
    'trial_balance',
    'balance_sheet',
  ])
  report_type!:
    | 'sales'
    | 'profitability'
    | 'profit_loss'
    | 'trial_balance'
    | 'balance_sheet';

  @IsIn(['csv', 'xlsx']) format!: 'csv' | 'xlsx';
  @IsOptional() @IsIn(['ar', 'en']) language?: 'ar' | 'en';
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @IsOptional() @Matches(DATE) as_of?: string;
  @IsOptional()
  @IsIn(SALES_GROUPS)
  group_by?: (typeof SALES_GROUPS)[number];
}

export type SalesGroup = NonNullable<SalesReportQueryDto['group_by']>;
export type ProfitGroup = NonNullable<ProfitabilityReportQueryDto['group_by']>;
