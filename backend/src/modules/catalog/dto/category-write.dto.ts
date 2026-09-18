import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { BilingualNameDto } from './bilingual-name.dto';

const emptyToNull = ({ value }: { value: unknown }): unknown =>
  value === '' ? null : value;

export class CategoryWriteDto extends BilingualNameDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  parent_id?: string | null;

  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(140)
  slug?: string;

  @IsOptional()
  @IsString()
  description_en?: string | null;

  @IsOptional()
  @IsString()
  description_ar?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  image_url?: string | null;

  @IsOptional()
  @Matches(/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/, {
    message:
      'icon_key must be a semantic key such as electronics or home_garden',
  })
  @MaxLength(80)
  icon_key?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_visible?: boolean;
}
