import 'reflect-metadata';
import { Type } from 'class-transformer';
import {
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
  @IsNumber({ maxDecimalPlaces: 2 })
  price_delta?: number;
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
