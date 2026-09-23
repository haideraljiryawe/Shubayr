import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Matches,
  Min,
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
  subtitle?: string | null;

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
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  link_url?: string | null;

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
