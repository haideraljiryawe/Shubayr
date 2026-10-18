import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class CatalogImportPreviewQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  create_missing?: boolean;
}

export class CatalogImportCommitDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;
}

export class CatalogImportHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;
}

export class CatalogImageBulkQueryDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  operation_id!: string;
}
