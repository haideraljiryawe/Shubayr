import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { MediaService, type UploadedImage } from './media.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('images')
  @RequirePermissions('catalog.products')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  uploadImage(
    @UploadedFile() file: UploadedImage | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.media.uploadImage(file, request.user.id);
  }

  @Public()
  @Get(':id')
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const media = await this.media.download(id);
    response.set({
      'Content-Type': media.mimeType,
      'Content-Length': media.sizeBytes.toString(),
      ETag: `"${media.checksum}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    response.send(media.body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('catalog.products')
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.media.remove(id);
  }
}
