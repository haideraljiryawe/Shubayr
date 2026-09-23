import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UserSelfUpdateDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string | null;
}
