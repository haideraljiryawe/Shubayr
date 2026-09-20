import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  NotEquals,
} from 'class-validator';

export class LoyaltyQueryDto {
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

export class RedeemPointsDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  points!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class AdjustPointsDto {
  @IsInt()
  @Min(-2_147_483_648)
  @Max(2_147_483_647)
  @NotEquals(0)
  points!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
