import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [MeController],
  providers: [JwtStrategy, MeService],
  exports: [PassportModule],
})
export class AuthModule {}
