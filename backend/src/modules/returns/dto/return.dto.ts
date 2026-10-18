import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { FinancialDocumentDto } from '../../finance/dto/finance.dto';

export const RETURN_CONDITIONS = [
  'sellable',
  'opened',
  'damaged',
  'expired',
] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export const RETURN_REASON_CODES = [
  'change_of_mind',
  'defect',
  'store_error',
  'wrong_item',
  'other',
] as const;

export const RETURN_STATUSES = [
  'requested',
  'approved',
  'partially_approved',
  'rejected',
  'received',
  'inspected',
  'refunded',
  'completed',
] as const;

export class RequestReturnLineDto {
  @IsUUID('4')
  order_item_id!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @IsIn(RETURN_REASON_CODES)
  reason_code: (typeof RETURN_REASON_CODES)[number] = 'other';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class RequestReturnDto {
  @IsUUID('4')
  order_id!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequestReturnLineDto)
  items!: RequestReturnLineDto[];
}

export class StaffCreateReturnDto extends RequestReturnDto {
  @IsUUID('4')
  customer_id!: string;
}

export class ApproveReturnLineDto {
  @IsUUID('4')
  return_item_id!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  approved_quantity!: number;
}

export class ReturnFeePreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApproveReturnLineDto)
  items!: ApproveReturnLineDto[];
}

export class ApproveReturnDto extends FinancialDocumentDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveReturnLineDto)
  items?: ApproveReturnLineDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  delivery_fee_refund?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  delivery_fee_refund_reason?: string;
}

export class ReceiveReturnDto extends FinancialDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InspectReturnLineDto {
  @IsUUID('4')
  return_item_id!: string;

  @IsIn(RETURN_CONDITIONS)
  condition!: ReturnCondition;

  @IsUUID('4')
  location_id!: string;
}

export class InspectReturnDto extends FinancialDocumentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InspectReturnLineDto)
  items!: InspectReturnLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RefundReturnDto extends FinancialDocumentDto {
  @IsIn(['cash_account', 'delivery_custody'])
  method!: 'cash_account' | 'delivery_custody';

  @IsOptional()
  @IsUUID('4')
  cash_account_id?: string;

  @IsOptional()
  @IsUUID('4')
  collection_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  proof_reference?: string;
}

export enum ReturnSortBy {
  Date = 'date',
  Number = 'number',
  Refund = 'refund',
}

export enum ReturnSortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

export class ReturnQueryDto {
  @IsOptional()
  @IsIn(RETURN_STATUSES)
  status?: (typeof RETURN_STATUSES)[number];

  @IsOptional()
  @IsUUID('4')
  customer_id?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(32)
  customer_phone?: string;

  @IsOptional()
  @IsUUID('4')
  order_id?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(40)
  order_number?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_to?: string;

  @IsOptional()
  @IsIn(Object.values(ReturnSortBy))
  sort_by: ReturnSortBy = ReturnSortBy.Date;

  @IsOptional()
  @IsIn(Object.values(ReturnSortDirection))
  sort_direction: ReturnSortDirection = ReturnSortDirection.Desc;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page = 20;
}
