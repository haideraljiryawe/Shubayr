import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
  IsInt,
  ValidateIf,
} from 'class-validator';

/**
 * Same E.164 shape the account phone uses. `contact_phone` previously only
 * had to be a 3-to-32 character string, so "   " satisfied @MinLength(3) and
 * was stored verbatim as a recipient nobody can call.
 */
const E164 = /^\+[1-9]\d{7,14}$/;

const PHONE_MESSAGE =
  'contact_phone must be an E.164 number such as +9647701234567';

/**
 * Surrounding whitespace is stripped before validation so it is never stored,
 * and a whitespace-only value collapses to '' which then fails the pattern.
 */
const trimPhone = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AddressCreateDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  area?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  street?: string | null;

  @IsOptional()
  @IsString()
  details?: string | null;

  @Transform(trimPhone)
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(E164, { message: PHONE_MESSAGE })
  contact_phone!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class AddressPatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string | null;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  city?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  area?: string | null;
  @IsOptional()
  @IsString()
  @MaxLength(160)
  street?: string | null;
  @IsOptional()
  @IsString()
  details?: string | null;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @Transform(trimPhone)
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(E164, { message: PHONE_MESSAGE })
  contact_phone?: string;
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  is_default?: boolean;
}

export class AddressQueryDto {
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
