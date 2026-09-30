import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class CategoryQueryDto {
  @IsOptional()
  @IsUUID()
  parent_id?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  include_subtree?: boolean;
}

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',').filter(Boolean)
        : value,
  )
  @IsArray()
  @IsUUID('4', { each: true })
  brand_id?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  min_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  max_price?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  on_sale?: boolean;

  @IsOptional()
  @IsIn(['newest', 'price_asc', 'price_desc', 'rating'])
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'rating';

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
