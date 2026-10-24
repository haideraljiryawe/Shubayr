import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../database/prisma.service';
import { ObjectStorageService } from './object-storage.service';
import { invalid } from '../../common/http/api-error';

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

const receiptExtensions: Record<string, string> = {
  ...extensions,
  'application/pdf': 'pdf',
};

function matchesMime(bytes: Buffer, mimeType: string): boolean {
  if (mimeType === 'application/pdf') {
    return (
      bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-'
    );
  }
  if (mimeType === 'image/jpeg') {
    return (
      bytes.length >= 3 &&
      bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    );
  }
  if (mimeType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    );
  }
  if (mimeType === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType === 'image/avif') {
    const brand = bytes.subarray(8, 12).toString('ascii');
    return (
      bytes.length >= 12 &&
      bytes.subarray(4, 8).toString('ascii') === 'ftyp' &&
      ['avif', 'avis'].includes(brand)
    );
  }
  return false;
}

export type UploadedImage = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Injectable()
export class MediaService {
  private readonly maxBytes: number;
  private readonly publicApiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    config: ConfigService,
  ) {
    this.maxBytes = config.get<number>('MEDIA_MAX_BYTES', 8 * 1024 * 1024);
    this.publicApiUrl = config
      .get<string>('PUBLIC_API_URL', 'http://localhost:8000/api/v1')
      .replace(/\/$/, '');
  }

  async uploadImage(file: UploadedImage | undefined, userId: string) {
    if (!file?.buffer?.length) {
      throw new UnprocessableEntityException(
        'A non-empty image file is required',
      );
    }
    const extension = extensions[file.mimetype];
    if (!extension) {
      throw new UnsupportedMediaTypeException(
        `Supported image types: ${Object.keys(extensions).join(', ')}`,
      );
    }
    if (!matchesMime(file.buffer, file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        'File contents do not match the declared image MIME type',
      );
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `Image must not exceed ${this.maxBytes} bytes`,
      );
    }

    const id = randomUUID();
    const now = new Date();
    const objectKey = `images/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${extension}`;
    const publicUrl = `${this.publicApiUrl}/media/${id}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(objectKey, file.buffer, file.mimetype);

    try {
      return await this.prisma.mediaObject.create({
        data: {
          id,
          object_key: objectKey,
          public_url: publicUrl,
          mime_type: file.mimetype,
          size_bytes: file.size,
          checksum,
          uploaded_by: userId,
        },
        select: {
          id: true,
          public_url: true,
          mime_type: true,
          size_bytes: true,
          checksum: true,
          created_at: true,
        },
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
  }

  async uploadCatalogImage(buffer: Buffer, userId: string) {
    if (!buffer.length) {
      throw new UnprocessableEntityException('A non-empty image is required');
    }
    if (buffer.length > this.maxBytes) {
      throw new PayloadTooLargeException(
        `Image must not exceed ${this.maxBytes} bytes`,
      );
    }
    let optimized: Buffer;
    try {
      const source = sharp(buffer, { failOn: 'error' }).rotate();
      const metadata = await source.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Image dimensions are unavailable');
      }
      const squareSide = Math.min(metadata.width, metadata.height, 1600);
      optimized = await source
        .resize({
          width: squareSide,
          height: squareSide,
          fit: 'cover',
          position: 'centre',
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
    } catch {
      throw new UnsupportedMediaTypeException(
        'Catalog image is not a supported image file',
      );
    }
    return this.uploadImage(
      { buffer: optimized, mimetype: 'image/webp', size: optimized.length },
      userId,
    );
  }

  async download(id: string) {
    const media = await this.prisma.mediaObject.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    if (media.object_key.startsWith('expense-receipts/')) {
      throw new NotFoundException('Media not found');
    }
    return {
      body: await this.storage.get(media.object_key),
      mimeType: media.mime_type,
      sizeBytes: media.size_bytes,
      checksum: media.checksum,
    };
  }

  async uploadExpenseReceipt(file: UploadedImage | undefined, userId: string) {
    if (!file?.buffer?.length) {
      throw new UnprocessableEntityException(
        'A non-empty receipt file is required',
      );
    }
    const extension = receiptExtensions[file.mimetype];
    if (!extension || !matchesMime(file.buffer, file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Supported receipt types: ${Object.keys(receiptExtensions).join(', ')}`,
      );
    }
    if (file.size > this.maxBytes) {
      throw new PayloadTooLargeException(
        `Receipt must not exceed ${this.maxBytes} bytes`,
      );
    }
    const id = randomUUID();
    const now = new Date();
    const objectKey = `expense-receipts/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}.${extension}`;
    const publicUrl = `${this.publicApiUrl}/admin/expense-receipts/${id}`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.put(objectKey, file.buffer, file.mimetype);
    try {
      return await this.prisma.mediaObject.create({
        data: {
          id,
          object_key: objectKey,
          public_url: publicUrl,
          mime_type: file.mimetype,
          size_bytes: file.size,
          checksum,
          uploaded_by: userId,
        },
        select: {
          id: true,
          public_url: true,
          mime_type: true,
          size_bytes: true,
          checksum: true,
          created_at: true,
        },
      });
    } catch (error) {
      await this.storage.remove(objectKey);
      throw error;
    }
  }

  async requireExpenseReceipt(id: string): Promise<void> {
    const receipt = await this.prisma.mediaObject.findUnique({ where: { id } });
    if (!receipt?.object_key.startsWith('expense-receipts/')) {
      throw invalid('EXPENSE_RECEIPT_INVALID', 'Receipt media is invalid');
    }
  }

  async downloadExpenseReceipt(id: string) {
    const media = await this.prisma.mediaObject.findUnique({ where: { id } });
    if (!media?.object_key.startsWith('expense-receipts/')) {
      throw new NotFoundException('Expense receipt not found');
    }
    const linked = await this.prisma.expense.count({
      where: { receipt_media_id: id },
    });
    if (!linked) throw new NotFoundException('Expense receipt not found');
    return {
      body: await this.storage.get(media.object_key),
      mimeType: media.mime_type,
      sizeBytes: media.size_bytes,
      checksum: media.checksum,
    };
  }

  async requireManagedUrl(url: string): Promise<void> {
    const media = await this.prisma.mediaObject.findUnique({
      where: { public_url: url },
      select: { id: true },
    });
    if (!media) {
      throw new UnprocessableEntityException(
        'Image URL must come from POST /media/images',
      );
    }
  }

  async remove(id: string): Promise<void> {
    const media = await this.prisma.mediaObject.findUnique({ where: { id } });
    if (!media) throw new NotFoundException('Media not found');
    const [category, productImage, brand, banner, orderItem, setting, expense] =
      await this.prisma.$transaction([
        this.prisma.category.findFirst({
          where: { image_url: media.public_url },
        }),
        this.prisma.productImage.findFirst({
          where: { url: media.public_url },
        }),
        this.prisma.brand.findFirst({
          where: { logo_url: media.public_url },
        }),
        this.prisma.banner.findFirst({
          where: { image_url: media.public_url },
        }),
        this.prisma.orderItem.findFirst({
          where: { image_url: media.public_url },
        }),
        this.prisma.storeSetting.findFirst({
          where: { key: 'logo_url', value: media.public_url },
        }),
        this.prisma.expense.findFirst({ where: { receipt_media_id: id } }),
      ]);
    if (
      category ||
      productImage ||
      brand ||
      banner ||
      orderItem ||
      setting ||
      expense
    ) {
      throw new ConflictException(
        'Media is still associated with application data',
      );
    }
    await this.prisma.mediaObject.delete({ where: { id } });
    await this.storage.remove(media.object_key);
  }
}
