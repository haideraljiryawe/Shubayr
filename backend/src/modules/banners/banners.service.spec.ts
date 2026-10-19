jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../media/media.service', () => ({ MediaService: class {} }));

import { UnprocessableEntityException } from '@nestjs/common';
import { BannersService } from './banners.service';

const now = new Date('2026-10-19T12:00:00.000Z');

const banner = (overrides: Record<string, unknown> = {}) => ({
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Legacy title',
  subtitle: 'Legacy subtitle',
  image_url: 'http://localhost:8000/api/v1/media/image-id',
  cta_text: 'Legacy CTA',
  link_url: null,
  internal_name: null,
  title_ar: null,
  title_en: null,
  subtitle_ar: null,
  subtitle_en: null,
  cta_label_ar: null,
  cta_label_en: null,
  show_text: true,
  action_type: 'none',
  action_target_id: null,
  is_default: false,
  default_priority: 0,
  sort_order: 0,
  is_active: true,
  starts_at: null,
  ends_at: null,
  created_at: new Date('2026-10-01T00:00:00.000Z'),
  ...overrides,
});

const readDelegates = () => ({
  product: { findMany: jest.fn().mockResolvedValue([]) },
  category: { findMany: jest.fn().mockResolvedValue([]) },
});

describe('BannersService', () => {
  it('uses server time and composes zero regular campaigns from two defaults', async () => {
    const findMany = jest.fn().mockResolvedValue([
      banner({ id: '10000000-0000-4000-8000-000000000002', is_default: true }),
      banner({
        id: '10000000-0000-4000-8000-000000000003',
        is_default: true,
        default_priority: 1,
      }),
    ]);
    const service = new BannersService(
      { banner: { findMany }, ...readDelegates() } as never,
      {} as never,
    );

    const result = await service.listPublic(now);

    expect(result).toHaveLength(2);
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

  it.each([
    [1, 2],
    [2, 2],
    [3, 3],
  ])(
    'composes %i eligible regular banners into %i slides',
    async (count, expected) => {
      const regular = Array.from({ length: count }, (_, index) =>
        banner({
          id: `10000000-0000-4000-8000-${String(10 + index).padStart(12, '0')}`,
          sort_order: index,
        }),
      );
      const defaults = [
        banner({
          id: '10000000-0000-4000-8000-000000000030',
          is_default: true,
        }),
        banner({
          id: '10000000-0000-4000-8000-000000000031',
          is_default: true,
        }),
      ];
      const service = new BannersService(
        {
          banner: {
            findMany: jest.fn().mockResolvedValue([...regular, ...defaults]),
          },
          ...readDelegates(),
        } as never,
        {} as never,
      );
      await expect(service.listPublic(now)).resolves.toHaveLength(expected);
    },
  );

  it('applies ar/en fallback and marks an unavailable structured target', async () => {
    const service = new BannersService(
      {
        banner: {
          findMany: jest.fn().mockResolvedValue([
            banner({
              action_type: 'product',
              action_target_id: '20000000-0000-4000-8000-000000000001',
              title_ar: 'عنوان',
              show_text: false,
            }),
          ]),
        },
        product: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: '20000000-0000-4000-8000-000000000001',
              category_id: '30000000-0000-4000-8000-000000000001',
              name_ar: 'منتج',
              name_en: 'Product',
              status: 'hidden',
              published_at: null,
            },
          ]),
        },
        category: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: '30000000-0000-4000-8000-000000000001',
              parent_id: null,
              is_visible: true,
            },
          ]),
        },
      } as never,
      {} as never,
    );

    const [result] = await service.listPublic(now);
    expect(result.title_ar).toBe('عنوان');
    expect(result.title_en).toBe('عنوان');
    expect(result.show_text).toBe(false);
    expect(result.action.type).toBe('product');
    expect(result.action.target?.available).toBe(false);
  });

  it('computes active, scheduled, expired and disabled admin statuses on server time', async () => {
    const rows = [
      banner({ id: '10000000-0000-4000-8000-000000000041' }),
      banner({
        id: '10000000-0000-4000-8000-000000000042',
        starts_at: new Date('2026-10-20T00:00:00.000Z'),
      }),
      banner({
        id: '10000000-0000-4000-8000-000000000043',
        ends_at: new Date('2026-10-18T00:00:00.000Z'),
      }),
      banner({
        id: '10000000-0000-4000-8000-000000000044',
        is_active: false,
        starts_at: new Date('2026-10-20T00:00:00.000Z'),
      }),
    ];
    const service = new BannersService(
      {
        banner: {
          count: jest.fn().mockResolvedValue(4),
          findMany: jest.fn().mockResolvedValue(rows),
        },
        $transaction: jest.fn((operations) => Promise.all(operations)),
        ...readDelegates(),
      } as never,
      {} as never,
    );
    const result = await service.listAdmin({}, now);
    expect(result.data.map(({ effective_status }) => effective_status)).toEqual(
      ['active', 'scheduled', 'expired', 'disabled'],
    );
  });

  it('maps a legacy link_url create to the url action without data loss', async () => {
    const requireManagedUrl = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(banner(data)),
    );
    const service = new BannersService(
      { banner: { create }, ...readDelegates() } as never,
      { requireManagedUrl } as never,
    );

    const result = await service.create({
      title: 'Offer',
      image_url: 'http://localhost:8000/api/v1/media/image-id',
      link_url: 'https://example.test/offer',
    });

    expect(result.action).toEqual({
      type: 'url',
      url: 'https://example.test/offer',
      target: null,
    });
    expect(requireManagedUrl).toHaveBeenCalled();
  });

  it('rejects an unknown product action target', async () => {
    const service = new BannersService(
      {
        product: { findUnique: jest.fn().mockResolvedValue(null) },
      } as never,
      { requireManagedUrl: jest.fn() } as never,
    );
    await expect(
      service.create({
        title: 'Offer',
        image_url: 'http://localhost:8000/api/v1/media/image-id',
        action_type: 'product',
        action_target_id: '20000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toMatchObject({
      response: { code: 'BANNER_ACTION_TARGET_NOT_FOUND' },
    });
  });

  it('rejects an inverted schedule while allowing either boundary alone', async () => {
    const service = new BannersService(
      {} as never,
      { requireManagedUrl: jest.fn() } as never,
    );
    await expect(
      service.create({
        title: 'Offer',
        image_url: 'http://localhost:8000/api/v1/media/image-id',
        starts_at: '2026-10-20T00:00:00.000Z',
        ends_at: '2026-10-19T00:00:00.000Z',
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('refuses a partial reorder before writing any sort positions', async () => {
    const update = jest.fn();
    const tx = {
      banner: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: '10000000-0000-4000-8000-000000000001' },
            { id: '10000000-0000-4000-8000-000000000002' },
          ]),
        update,
      },
    };
    const transaction = jest.fn(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    const service = new BannersService(
      { $transaction: transaction } as never,
      {} as never,
    );
    await expect(
      service.reorder(['10000000-0000-4000-8000-000000000001']),
    ).rejects.toMatchObject({
      response: { code: 'BANNER_ORDER_IDS_INVALID' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses disabling one of two usable defaults', async () => {
    const stored = banner({ is_default: true });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      banner: {
        findUnique: jest.fn().mockResolvedValue(stored),
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
        update: jest
          .fn()
          .mockResolvedValue(banner({ is_default: true, is_active: false })),
      },
    };
    const transaction = jest.fn(
      (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    );
    const service = new BannersService(
      { $transaction: transaction } as never,
      {} as never,
    );

    await expect(
      service.update(stored.id, { is_active: false }),
    ).rejects.toMatchObject({
      response: { code: 'BANNER_DEFAULT_MINIMUM_REQUIRED' },
    });
  });
});
