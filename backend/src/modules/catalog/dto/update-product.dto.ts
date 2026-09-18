import { PartialType } from '@nestjs/swagger';
import { ProductWriteDto } from './product-write.dto';

// PATCH omission preserves the stored value. Explicit nullable fields clear
// that value; discount_type=null clears the complete discount definition in
// the service merge helper.
export class UpdateProductDto extends PartialType(ProductWriteDto) {}
