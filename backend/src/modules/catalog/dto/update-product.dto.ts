import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { OmitType, PartialType } from '@nestjs/swagger';
import { ProductMediaOperationDto } from './product-media.dto';
import { ProductWriteDto } from './product-write.dto';

// PATCH omission preserves the stored value. Explicit nullable fields clear
// that value; discount_type=null clears the complete discount definition in
// the service merge helper.
export class UpdateProductDto extends PartialType(
  OmitType(ProductWriteDto, ['images'] as const),
) {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMediaOperationDto)
  media_operations?: ProductMediaOperationDto[];
}
