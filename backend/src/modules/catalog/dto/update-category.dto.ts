import { BilingualNameDto } from './bilingual-name.dto';

// Category updates intentionally keep both names required instead of using
// PartialType: every admin write must preserve a complete bilingual name pair.
export class UpdateCategoryDto extends BilingualNameDto {}
