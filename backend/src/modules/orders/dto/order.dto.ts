import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  Max,
  MaxLength,
  Matches,
  Min,
  IsNumber,
  ValidateIf,
} from 'class-validator';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready_for_dispatch',
  'dispatched',
  'delivered',
  'failed',
  'rejected',
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

  @IsOptional()
  @Type(() => AcceptedPriceVersionDto)
  @ValidateNested({ each: true })
  accepted_price_versions?: AcceptedPriceVersionDto[];
}

export class AcceptedPriceVersionDto {
  @IsUUID()
  variant_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  price_version!: string;
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

  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  below_cost_override_reason?: string | null;

  @IsOptional()
  @IsUUID()
  below_cost_originator_id?: string | null;
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
  @IsInt()
  @Min(1)
  version!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class RejectOrderDto extends CancelOrderDto {}

export class CustomerCancelDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancellationRequestDto extends CustomerCancelDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ResolveCancellationRequestDto extends CustomerCancelDto {
  @IsIn(['approved', 'denied'])
  decision!: 'approved' | 'denied';

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ResolveShortageDto extends CustomerCancelDto {
  @IsIn(['reduce', 'cancel_line', 'cancel_order'])
  action!: 'reduce' | 'cancel_line' | 'cancel_order';

  @ValidateIf((input: ResolveShortageDto) => input.action !== 'cancel_order')
  @IsUUID()
  order_item_id?: string;

  @ValidateIf((input: ResolveShortageDto) => input.action === 'reduce')
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  new_quantity?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ShortageResponseDto extends CustomerCancelDto {
  @IsIn(['accepted', 'denied'])
  decision!: 'accepted' | 'denied';
}
