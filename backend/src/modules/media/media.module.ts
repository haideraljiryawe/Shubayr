import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { ObjectStorageService } from './object-storage.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, ObjectStorageService],
  exports: [MediaService, ObjectStorageService],
})
export class MediaModule {}
