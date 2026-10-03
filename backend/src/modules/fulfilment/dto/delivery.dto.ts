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
  ValidateIf,
} from 'class-validator';

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

export class UpdateDeliveryStatusDto {
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

export class UpdateStaffDeliveryStatusDto {
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
}

export class AssignDeliveryDto {
  @IsUUID()
  agent_id!: string;
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
