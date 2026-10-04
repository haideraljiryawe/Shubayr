import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  IsOptional,
  MinLength,
  IsInt,
  IsEnum,
  Max,
} from 'class-validator';

export enum PricePublishApprovalStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
}

export class LinkedPricePreviewDto {
  @IsString()
  @Length(3, 3)
  currency_code!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 10 })
  @Min(0.0000000001)
  rate!: number;

  @Type(() => Number)
  @IsIn([1, 100])
  basis!: 1 | 100;

  @IsDateString()
  effective_at!: string;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class LinkedPriceApplyDto {
  @IsUUID()
  preview_token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  below_cost_override_reason?: string | null;
}

export class PricePublishDecisionDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class PricePublishApprovalQueryDto {
  @IsOptional()
  @IsEnum(PricePublishApprovalStatus)
  status?: PricePublishApprovalStatus;

  @IsOptional()
  @IsUUID()
  proposer_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

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
