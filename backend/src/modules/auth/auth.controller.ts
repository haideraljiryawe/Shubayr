import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { RefreshTokenDto, RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-otp')
  requestOtp(@Body() input: RequestOtpDto) {
    return this.auth.requestOtp(input);
  }

  @Post('verify-otp')
  verifyOtp(@Body() input: VerifyOtpDto) {
    return this.auth.verifyOtp(input);
  }

  @Post('refresh')
  refresh(@Body() input: RefreshTokenDto) {
    return this.auth.refresh(input);
  }
}
