import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum DeliveryPartyKind {
  InternalAgent = 'internal_agent',
  ExternalDriver = 'external_driver',
}

export class DeliveryPartyQueryDto {
  @IsOptional()
  @IsEnum(DeliveryPartyKind)
  kind?: DeliveryPartyKind;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

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

export enum CustodyOverviewSort {
  Name = 'name',
  GoodsValue = 'goods_value_iqd',
  CashHeld = 'cash_held',
  OldestItemAge = 'oldest_item_age_days',
  OrdersHeld = 'orders_held',
}

export enum SortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

export class CustodyOverviewQueryDto extends DeliveryPartyQueryDto {
  @IsOptional()
  @IsEnum(CustodyOverviewSort)
  sort_by: CustodyOverviewSort = CustodyOverviewSort.Name;

  @IsOptional()
  @IsEnum(SortDirection)
  sort_direction: SortDirection = SortDirection.Asc;
}

export class CreateExternalDriverDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicle_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateExternalDriverDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicle_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class PartyStatementQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

  @IsOptional()
  @IsUUID()
  order_id?: string;

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
