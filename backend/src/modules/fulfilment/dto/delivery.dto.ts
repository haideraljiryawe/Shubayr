import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  IsNotEmpty,
  IsDecimal,
  IsISO8601,
  IsDateString,
  IsNumber,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export const AGENT_DELIVERY_STATUSES = [
  'out_for_delivery',
  'delivered',
  'failed',
  'returned',
] as const;
export type AgentDeliveryStatus = (typeof AGENT_DELIVERY_STATUSES)[number];

export const STAFF_DELIVERY_STATUSES = [
  'out_for_delivery',
  'delivered',
  'failed',
] as const;
export type StaffDeliveryStatus = (typeof STAFF_DELIVERY_STATUSES)[number];

export const COLLECTION_CONFIRMATION_STATUSES = [
  'confirmed',
  'unconfirmed',
] as const;
export type CollectionConfirmationStatus =
  (typeof COLLECTION_CONFIRMATION_STATUSES)[number];

class DeliveryCollectionInput {
  @ValidateIf(
    (input: DeliveryCollectionInput & { status?: string }) =>
      input.status === 'delivered',
  )
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id?: string;

  @ValidateIf(
    (input: DeliveryCollectionInput & { status?: string }) =>
      input.status === 'delivered',
  )
  @IsIn(COLLECTION_CONFIRMATION_STATUSES)
  collection_confirmation?: CollectionConfirmationStatus;

  @ValidateIf(
    (input: DeliveryCollectionInput & { status?: string }) =>
      input.status === 'delivered' &&
      input.collection_confirmation === 'confirmed',
  )
  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  collected_amount?: string;
}

export class UpdateDeliveryStatusDto extends DeliveryCollectionInput {
  @IsIn(AGENT_DELIVERY_STATUSES)
  status!: AgentDeliveryStatus;

  @IsInt()
  @Min(1)
  order_version!: number;

  @ValidateIf((input: UpdateDeliveryStatusDto) => input.status === 'failed')
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}

export class UpdateStaffDeliveryStatusDto extends DeliveryCollectionInput {
  @IsIn(STAFF_DELIVERY_STATUSES)
  status!: StaffDeliveryStatus;

  @IsInt()
  @Min(1)
  order_version!: number;

  @ValidateIf(
    (input: UpdateStaffDeliveryStatusDto) => input.status === 'failed',
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  event_at?: string;

  @ValidateIf(
    (input: UpdateStaffDeliveryStatusDto) => input.status === 'delivered',
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  source?: string;
}

export class ConfirmDeliveryCollectionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsDecimal({ decimal_digits: '0,6', force_decimal: false })
  collected_amount!: string;
}

export class UnconfirmedDeliveriesQueryDto {
  @IsOptional()
  @IsIn(['date', 'amount'])
  sort_by: 'date' | 'amount' = 'date';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_direction: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsUUID()
  party_id?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  amount_min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  amount_max?: number;

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

export class PartyCollectionsQueryDto {
  @IsOptional()
  @IsIn(['date', 'amount'])
  sort_by: 'date' | 'amount' = 'date';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_direction: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsIn(['confirmed_full', 'confirmed_short', 'unconfirmed'])
  status?: 'confirmed_full' | 'confirmed_short' | 'unconfirmed';

  @IsOptional()
  @IsUUID()
  order_id?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  date_to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  amount_min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  amount_max?: number;

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

export class AssignDeliveryDto {
  @IsOptional()
  @IsUUID()
  agent_id?: string;

  @IsOptional()
  @IsUUID()
  party_id?: string;
}

export class CreateDeliveryRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
