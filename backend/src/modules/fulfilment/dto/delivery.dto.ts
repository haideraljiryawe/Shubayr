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

export const AGENT_DELIVERY_STATUSES = [
  'out_for_delivery',
  'delivered',
  'failed',
  'returned',
] as const;
export type AgentDeliveryStatus = (typeof AGENT_DELIVERY_STATUSES)[number];

export class UpdateDeliveryStatusDto {
  @IsIn(AGENT_DELIVERY_STATUSES)
  status!: AgentDeliveryStatus;
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
