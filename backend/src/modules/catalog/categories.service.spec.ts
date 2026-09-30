jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../media/media.service', () => ({ MediaService: class {} }));

import { ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

const rows = [
  {
    id: 'root-visible',
    parent_id: null,
    name_en: 'Visible',
    name_ar: 'مرئي',
    slug: 'visible',
    description_en: 'Visible description',
    description_ar: null,
    image_url: null,
    icon_key: 'visible',
    sort_order: 0,
    is_visible: true,
  },
  {
    id: 'root-hidden',
    parent_id: null,
    name_en: 'Hidden',
    name_ar: 'مخفي',
    slug: 'hidden',
    description_en: null,
    description_ar: null,
    image_url: null,
    icon_key: 'hidden',
    sort_order: 1,
    is_visible: false,
  },
  {
    id: 'child-visible',
    parent_id: 'root-hidden',
    name_en: 'Visible child of hidden parent',
    name_ar: 'فرعي',
    slug: 'child',
    description_en: null,
    description_ar: null,
    image_url: null,
    icon_key: 'child',
    sort_order: 0,
    is_visible: true,
  },
];

describe('CategoriesService', () => {
  it('hides a visible child when any ancestor is hidden', async () => {
    const service = new CategoriesService(
      { category: { findMany: jest.fn().mockResolvedValue(rows) } } as never,
      {} as never,
      {} as never,
    );

    const result = await service.list({}, false);
    expect(result.map(({ id }) => id)).toEqual(['root-visible']);
  });

  it('lets admin reads see hidden categories and their subtree', async () => {
    const service = new CategoriesService(
      { category: { findMany: jest.fn().mockResolvedValue(rows) } } as never,
      {} as never,
      {} as never,
    );

    const result = await service.list({}, true);
    expect(result.map(({ id }) => id)).toEqual(['root-visible', 'root-hidden']);
    expect(result[1].children.map(({ id }) => id)).toEqual(['child-visible']);
  });

  it('rejects reparenting a category below its descendant', async () => {
    const service = new CategoriesService(
      { category: { findMany: jest.fn().mockResolvedValue(rows) } } as never,
      { requireManagedUrl: jest.fn() } as never,
      {} as never,
    );

    await expect(
      service.update('root-hidden', { parent_id: 'child-visible' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects deletion while a category has products', async () => {
    const prisma = {
      category: {
        findUnique: jest.fn().mockResolvedValue({ id: 'root-visible' }),
        count: jest.fn().mockResolvedValue(0),
      },
      product: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((operations: Array<Promise<unknown>>) =>
        Promise.all(operations),
      ),
    };
    const service = new CategoriesService(
      prisma as never,
      {} as never,
      {} as never,
    );
    await expect(service.remove('root-visible')).rejects.toThrow(
      ConflictException,
    );
  });
});
