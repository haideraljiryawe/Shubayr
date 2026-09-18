import { PartialType } from '@nestjs/swagger';
import { CategoryWriteDto } from './category-write.dto';

export class UpdateCategoryDto extends PartialType(CategoryWriteDto) {}
