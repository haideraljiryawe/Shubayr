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
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;
}

export class ProductVariantInputDto {
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
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
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
