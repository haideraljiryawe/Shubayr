import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Policy } from '../../common/decorators/access-policy.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  RateLimitRisk,
  RateLimitTier,
} from '../../common/rate-limit/rate-limit-tier';
import { AuthService } from './auth.service';
import {
  AdminLoginDto,
  ChangePasswordDto,
  RefreshTokenDto,
  RequestOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-otp')
  @RateLimitTier(RateLimitRisk.Strict)
  @HttpCode(200)
  requestOtp(@Body() input: RequestOtpDto) {
    return this.auth.requestOtp(input);
  }

  @Post('verify-otp')
  @RateLimitTier(RateLimitRisk.Strict)
  @HttpCode(200)
  verifyOtp(@Body() input: VerifyOtpDto) {
    return this.auth.verifyOtp(input);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() input: RefreshTokenDto) {
    return this.auth.refresh(input);
  }

  @Post('logout')
  logout(@Body() input: RefreshTokenDto) {
    return this.auth.logout(input);
  }
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimitTier(RateLimitRisk.Strict)
  @Post('login')
  login(@Body() input: AdminLoginDto, @Req() request: Request) {
    return this.auth.adminLogin(input, request.ip);
  }

  @Policy({
    access: 'authenticated',
    surfaces: ['admin'],
    allowPasswordChange: true,
  })
  @Post('change-password')
  changePassword(
    @Req() request: Request & { user: AuthenticatedRequestUser },
    @Body() input: ChangePasswordDto,
  ) {
    return this.auth.changePassword(request.user.id, input, request.ip);
  }
}
