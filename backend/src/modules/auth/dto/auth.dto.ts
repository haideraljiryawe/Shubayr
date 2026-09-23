import { IsJWT, IsString, Matches } from 'class-validator';

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
}

export class RefreshTokenDto {
  @IsJWT()
  refresh_token!: string;
}
