import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { BilingualNameDto } from './bilingual-name.dto';

const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

export class BrandWriteDto extends BilingualNameDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(140)
  slug!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  logo_url?: string | null;

  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  is_visible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;
}

export class ConvertCategoryToBrandDto extends BrandWriteDto {
  @IsUUID()
  target_category_id!: string;
}

export class UpdateBrandDto extends PartialType(BrandWriteDto, {
  skipNullProperties: false,
}) {}

export class BrandQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

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
