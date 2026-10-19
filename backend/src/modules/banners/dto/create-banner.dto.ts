import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
  Min,
  IsUUID,
} from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }): unknown =>
  value === '' ? null : value;

export class CreateBannerDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'title must contain a non-whitespace character' })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  internal_name?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  title_ar?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  title_en?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  subtitle?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  subtitle_ar?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  subtitle_en?: string | null;

  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  image_url!: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  cta_text?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  cta_label_ar?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  cta_label_en?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  link_url?: string | null;

  @IsOptional()
  @IsBoolean()
  show_text?: boolean;

  @IsOptional()
  @IsIn(['none', 'url', 'product', 'category', 'offers'])
  action_type?: 'none' | 'url' | 'product' | 'category' | 'offers';

  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  action_target_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  default_priority?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601({ strict: true })
  starts_at?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsISO8601({ strict: true })
  ends_at?: string | null;
}
