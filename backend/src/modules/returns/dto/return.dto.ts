import { Type, Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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

export const RETURN_CONDITIONS = ['sellable', 'opened', 'damaged'] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export class RequestReturnLineDto {
  @IsUUID()
  order_item_id!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class RequestReturnDto {
  @IsUUID()
  order_id!: string;

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

export class InspectReturnLineDto {
  @IsUUID()
  return_item_id!: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  approved_quantity!: number;

  @IsOptional()
  @IsIn(RETURN_CONDITIONS)
  condition?: ReturnCondition;
}

export class InspectReturnDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectReturnLineDto)
  items?: InspectReturnLineDto[];
}

export class ReturnQueryDto {
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

  @IsOptional()
  @IsIn([
    'requested',
    'approved',
    'partially_approved',
    'rejected',
    'completed',
  ])
  status?: string;
}
