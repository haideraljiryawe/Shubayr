import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class BulkProductDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsIn(['publish', 'hide', 'set_category', 'set_brand'])
  action!: 'publish' | 'hide' | 'set_category' | 'set_brand';

  @ValidateIf((input: BulkProductDto) => input.action === 'set_category')
  @IsUUID('4')
  category_id?: string;

  @ValidateIf((input: BulkProductDto) => input.action === 'set_brand')
  @IsOptional()
  @IsUUID('4')
  brand_id?: string | null;
}
