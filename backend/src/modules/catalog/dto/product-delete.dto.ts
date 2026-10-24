import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ProductDeletePreviewListDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class BulkProductDeleteDto extends ProductDeletePreviewListDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;
}
