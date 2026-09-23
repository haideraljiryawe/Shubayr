jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../media/media.service', () => ({ MediaService: class {} }));

import { UnprocessableEntityException } from '@nestjs/common';
import { BannersService } from './banners.service';

describe('BannersService', () => {
  it('uses server time to select active banners in display order', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new BannersService(
      { banner: { findMany } } as never,
      {} as never,
    );
    const now = new Date('2026-09-18T12:00:00.000Z');

    await service.listPublic(now);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        is_active: true,
        AND: [
          { OR: [{ starts_at: null }, { starts_at: { lte: now } }] },
          { OR: [{ ends_at: null }, { ends_at: { gte: now } }] },
        ],
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    });
  });

  it('requires media uploaded through the durable media endpoint', async () => {
    const requireManagedUrl = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue({ id: 'banner' });
    const service = new BannersService(
      { banner: { create } } as never,
      { requireManagedUrl } as never,
    );

    await service.create({
      title: 'Offer',
      image_url: 'http://localhost:8000/api/v1/media/image-id',
    });

    expect(requireManagedUrl).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/media/image-id',
    );
  });

  it('rejects an inverted schedule', async () => {
    const service = new BannersService(
      {} as never,
      { requireManagedUrl: jest.fn() } as never,
    );

    await expect(
      service.create({
        title: 'Offer',
        image_url: 'http://localhost:8000/api/v1/media/image-id',
        starts_at: '2026-09-19T00:00:00.000Z',
        ends_at: '2026-09-18T00:00:00.000Z',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('preserves omitted schedule fields during PATCH validation', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'banner' });
    const service = new BannersService(
      {
        banner: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'banner',
            starts_at: new Date('2026-09-18T00:00:00.000Z'),
            ends_at: new Date('2026-09-20T00:00:00.000Z'),
          }),
          update,
        },
      } as never,
      {} as never,
    );

    await service.update('banner', { title: 'Renamed' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'banner' },
      data: { title: 'Renamed' },
    });
  });
});
