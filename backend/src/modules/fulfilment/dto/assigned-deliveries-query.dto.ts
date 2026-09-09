import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum DeliveryStatus {
  Assigned = 'assigned',
  OutForDelivery = 'out_for_delivery',
  Delivered = 'delivered',
  Failed = 'failed',
  Returned = 'returned',
}

export class AssignedDeliveriesQueryDto {
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

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
