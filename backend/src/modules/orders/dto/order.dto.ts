import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'cancelled',
  'return_requested',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

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
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
