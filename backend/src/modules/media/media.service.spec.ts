jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
jest.mock('./object-storage.service', () => ({
  ObjectStorageService: class {},
}));

import {
  ConflictException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MediaService } from './media.service';

const config = {
  get: jest.fn((key: string, fallback?: unknown) => {
    if (key === 'MEDIA_MAX_BYTES') return 8;
    if (key === 'PUBLIC_API_URL') return 'http://localhost:8000/api/v1/';
    return fallback;
  }),
};

const image = {
  buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
  mimetype: 'image/png',
  size: 8,
};

describe('MediaService', () => {
  it('stores bytes first and persists a stable API URL with checksum', async () => {
    let createInput: unknown;
    const prisma = {
      mediaObject: {
        create: jest.fn((input: { data: Record<string, unknown> }) => {
          createInput = input;
          return Promise.resolve({ ...input.data, created_at: new Date() });
        }),
      },
    };
    const storage = {
      put: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MediaService(
      prisma as never,
      storage as never,
      config as never,
    );

    const result = await service.uploadImage(image, 'uploader-id');

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^images\/\d{4}\/\d{2}\/.+\.png$/),
      image.buffer,
      'image/png',
    );
    const input = createInput as {
      data: { public_url: string; checksum: string; uploaded_by: string };
    };
    expect(input.data.public_url).toMatch(
      /^http:\/\/localhost:8000\/api\/v1\/media\/[0-9a-f-]+$/,
    );
    expect(input.data.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(input.data.uploaded_by).toBe('uploader-id');
    expect(result).toEqual(expect.objectContaining({ mime_type: 'image/png' }));
  });

  it('rejects unsupported image MIME types', async () => {
    const service = new MediaService({} as never, {} as never, config as never);
    await expect(
      service.uploadImage({ ...image, mimetype: 'image/svg+xml' }, 'user-id'),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects bytes that do not match the declared MIME type', async () => {
    const service = new MediaService({} as never, {} as never, config as never);
    await expect(
      service.uploadImage(
        { buffer: Buffer.from('not a png'), mimetype: 'image/png', size: 8 },
        'user-id',
      ),
    ).rejects.toThrow(UnsupportedMediaTypeException);
  });

  it('rejects oversized images', async () => {
    const service = new MediaService({} as never, {} as never, config as never);
    await expect(
      service.uploadImage({ ...image, size: 9 }, 'user-id'),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('requires catalog associations to use a managed stable URL', async () => {
    const service = new MediaService(
      {
        mediaObject: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
      config as never,
    );
    await expect(
      service.requireManagedUrl('https://unmanaged.example/image.png'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses to delete media while catalog data references it', async () => {
    const media = {
      id: 'media-id',
      public_url: 'http://localhost:8000/api/v1/media/media-id',
      object_key: 'images/media.png',
    };
    const prisma = {
      mediaObject: { findUnique: jest.fn().mockResolvedValue(media) },
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'category' }) },
      productImage: { findFirst: jest.fn().mockResolvedValue(null) },
      banner: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new MediaService(
      prisma as never,
      {} as never,
      config as never,
    );

    await expect(service.remove('media-id')).rejects.toThrow(ConflictException);
  });
});
