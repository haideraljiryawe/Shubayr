import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_dispatch',
  'dispatched',
  'delivered',
  'failed',
  'cancelled',
  'return_requested',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STAFF_ORDER_STATUSES = [
  'confirmed',
  'preparing',
  'ready_for_dispatch',
  'dispatched',
] as const;
export type StaffOrderStatus = (typeof STAFF_ORDER_STATUSES)[number];

export class PlaceOrderDto {
  @IsUUID()
  address_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  coupon_code?: string | null;

  @IsIn(['cod'])
  @IsOptional()
  payment_method?: 'cod';
}

export class OrderQueryDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
}

export class UpdateOrderStatusDto {
  @IsIn(STAFF_ORDER_STATUSES)
  status!: StaffOrderStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class AdminOrderQueryDto extends OrderQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(40)
  q?: string;

  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

export class MonitorOrderQueryDto {
  @IsOptional()
  @IsIn([...ORDER_STATUSES, 'all'])
  status?: OrderStatus | 'all';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
}

export class CancelOrderDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
