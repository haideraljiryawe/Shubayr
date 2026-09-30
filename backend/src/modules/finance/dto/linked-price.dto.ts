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
} from 'class-validator';

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
}
