import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminAuthController, AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { SmsGatewayService } from './sms-gateway.service';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    RbacModule,
    JwtModule.register({}),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [AuthController, AdminAuthController, MeController],
  providers: [AuthService, JwtStrategy, MeService, SmsGatewayService],
  exports: [PassportModule],
})
export class AuthModule {}
