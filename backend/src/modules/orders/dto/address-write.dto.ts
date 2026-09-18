import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

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

  @IsString()
  @MinLength(3)
  @MaxLength(32)
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

export class AddressPatchDto extends PartialType(AddressCreateDto) {}
