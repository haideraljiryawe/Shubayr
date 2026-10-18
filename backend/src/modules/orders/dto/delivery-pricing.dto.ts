import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class GovernoratePatchDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_ar?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_en?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class DeliveryZoneCreateDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_ar!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_en!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  fee_iqd!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  governorate_ids!: string[];
}

export class DeliveryZonePatchDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_ar?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name_en?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fee_iqd?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  governorate_ids?: string[];
}

export class DiscountTierCreateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_subtotal_iqd!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(50)
  percent!: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class DiscountTierPatchDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_subtotal_iqd?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(50)
  percent?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
