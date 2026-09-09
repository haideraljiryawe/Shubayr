import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export abstract class BilingualNameDto {
  @Transform(trimString)
  @IsString({ message: 'name_ar must be a string' })
  @IsNotEmpty({ message: 'name_ar is required and must not be empty' })
  name_ar!: string;

  @Transform(trimString)
  @IsString({ message: 'name_en must be a string' })
  @IsNotEmpty({ message: 'name_en is required and must not be empty' })
  name_en!: string;
}
