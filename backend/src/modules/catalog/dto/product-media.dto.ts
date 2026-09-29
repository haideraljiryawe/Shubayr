import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ProductImageInputDto {
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  url!: string;
}

export class ProductVariantInputDto {
  // Optional stable handle. Supplying it lets an update rename a variant's
  // SKU without the variant losing its identity; omitted, variants are
  // matched on the (globally unique) SKU instead.
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(80)
  sku!: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  price_delta?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  base_unit?: string;

  @IsOptional()
  @IsBoolean()
  whole_units_only?: boolean;

  @IsOptional()
  @IsInt({ message: 'IQD selling_price must use whole dinars' })
  @Min(0)
  selling_price?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  low_stock_threshold?: number | null;

  @IsOptional()
  @IsIn(['fixed', 'linked'])
  pricing_mode?: 'fixed' | 'linked';

  @IsOptional()
  @IsString()
  @MaxLength(3)
  reference_currency_code?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  reference_price?: number | null;
}

export class ProductMediaOperationDto {
  @IsIn(['add', 'remove', 'replace', 'move'])
  op!: 'add' | 'remove' | 'replace' | 'move';

  @ValidateIf((value: ProductMediaOperationDto) => value.op !== 'add')
  @IsUUID()
  image_id?: string;

  @ValidateIf(
    (value: ProductMediaOperationDto) =>
      value.op === 'add' || value.op === 'replace',
  )
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  url?: string;

  @ValidateIf(
    (value: ProductMediaOperationDto) =>
      value.op === 'add' || value.op === 'move',
  )
  @IsInt()
  @Min(0)
  position?: number;
}

export class ProductMediaOperationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaOperationDto)
  operations!: ProductMediaOperationDto[];
}
