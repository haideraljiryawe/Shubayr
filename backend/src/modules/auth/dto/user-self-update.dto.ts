import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UserSelfUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;
}
