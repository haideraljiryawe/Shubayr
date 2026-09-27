import { Transform } from 'class-transformer';
import {
  IsIn,
  IsJWT,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PASSWORD_PATTERN } from '../password';

export class RequestOtpDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be an E.164 number such as +9647701234567',
  })
  phone!: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must contain exactly 6 digits' })
  code!: string;

  @IsOptional()
  @IsIn(['mobile', 'web_store'])
  client?: 'mobile' | 'web_store' = 'mobile';
}

export class RefreshTokenDto {
  @IsJWT()
  refresh_token!: string;
}

export class AdminLoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z][a-z0-9._-]{2,79}$/)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  current_password!: string;

  @IsString()
  @Matches(PASSWORD_PATTERN, {
    message:
      'new_password must be 12-128 characters with upper, lower, number, and symbol',
  })
  new_password!: string;
}
