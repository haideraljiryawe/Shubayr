import { BilingualNameDto } from './bilingual-name.dto';

// Product updates intentionally keep both names required instead of using
// PartialType: every admin write must preserve a complete bilingual name pair.
export class UpdateProductDto extends BilingualNameDto {}
