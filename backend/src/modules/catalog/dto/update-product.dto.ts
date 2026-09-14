import { ProductWriteDto } from './product-write.dto';

// Product updates intentionally keep both names and the price required instead
// of using PartialType: every admin write must preserve a complete bilingual
// name pair, and must restate the price the discount definition is judged
// against.
export class UpdateProductDto extends ProductWriteDto {}
