import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import {
  AdminBannersController,
  PublicBannersController,
} from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  imports: [MediaModule],
  controllers: [PublicBannersController, AdminBannersController],
  providers: [BannersService],
})
export class BannersModule {}
