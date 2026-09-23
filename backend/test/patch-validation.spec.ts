jest.mock('../src/database/prisma.service', () => ({
  PrismaService: class {},
}));
jest.mock('../src/modules/media/media.service', () => ({
  MediaService: class {},
}));

import {
  Type,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { validationExceptionFactory } from '../src/common/http/api-error';
import { NonEmptyPatchPipe } from '../src/common/http/non-empty-patch.pipe';
import { UserSelfUpdateDto } from '../src/modules/auth/dto/user-self-update.dto';
import { UpdateCategoryDto } from '../src/modules/catalog/dto/update-category.dto';
import { UpdateProductDto } from '../src/modules/catalog/dto/update-product.dto';
import { ProductsService } from '../src/modules/catalog/products.service';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  exceptionFactory: validationExceptionFactory,
});
async function validate<T extends object>(
  Dto: Type<T>,
  body: object,
): Promise<T> {
  const input = (await pipe.transform(body, {
    type: 'body',
    metatype: Dto,
  })) as T;
  if (Dto === UpdateProductDto || Dto === UpdateCategoryDto) {
    new NonEmptyPatchPipe().transform(input as Record<string, unknown>);
  }
  return input;
}

describe('PATCH validation', () => {
  it.each<[string, Type<object>, object]>([
    ['category name null', UpdateCategoryDto, { name_en: null }],
    ['category visibility null', UpdateCategoryDto, { is_visible: null }],
    ['profile name null', UserSelfUpdateDto, { name: null }],
    ['empty category', UpdateCategoryDto, {}],
    ['empty product', UpdateProductDto, {}],
    ['product media null', UpdateProductDto, { media_operations: null }],
  ])(
    'rejects %s with 422 during request validation',
    async (_label, Dto, body) => {
      await expect(validate(Dto, body)).rejects.toMatchObject({ status: 422 });
      await expect(validate(Dto, body)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    },
  );

  it('accepts false visibility and nullable category clears', async () => {
    await expect(
      validate(UpdateCategoryDto, { is_visible: false }),
    ).resolves.toMatchObject({ is_visible: false });
    await expect(
      validate(UpdateCategoryDto, {
        parent_id: null,
        description_en: null,
        image_url: null,
      }),
    ).resolves.toMatchObject({
      parent_id: null,
      description_en: null,
      image_url: null,
    });
  });

  it('allows clearing email while omitting the profile name', async () => {
    const input = await validate(UserSelfUpdateDto, { email: null });
    expect(input.email).toBeNull();
    expect(input.name).toBeUndefined();
  });

  it('accepts a single category name without restating the other', async () => {
    const input = await validate(UpdateCategoryDto, { name_en: ' Updated ' });
    expect(input.name_en).toBe('Updated');
    expect(input.name_ar).toBeUndefined();
  });

  it('accepts an explicit empty media operation list', async () => {
    await expect(
      validate(UpdateProductDto, { media_operations: [] }),
    ).resolves.toMatchObject({ media_operations: [] });
  });
});

const initialProduct = {
  id: 'product-id',
  category_id: 'category-id',
  name_en: 'Coffee',
  name_ar: 'قهوة',
  description: 'Original',
  price: 100,
  discount_type: 'percentage',
  discount_value: 20,
  discount_starts_at: new Date('2020-01-01T00:00:00Z'),
  discount_ends_at: new Date('2030-01-01T00:00:00Z'),
  is_negotiable: false,
  floor_price: null,
  points_price: null,
  rating_avg: 0,
  images: [],
  variants: [],
};

describe('validated product PATCH preserves stored pricing', () => {
  let stored: Record<string, unknown>;
  const write = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) stored[key] = value;
    }
    return Promise.resolve(stored);
  });
  const prisma = {
    product: {
      findUnique: jest.fn(() => Promise.resolve(stored)),
      update: write,
    },
    batchStock: { findMany: jest.fn().mockResolvedValue([]) },
    stockReservation: { findMany: jest.fn().mockResolvedValue([]) },
    simpleStockHold: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((operation: unknown): Promise<unknown> =>
      typeof operation === 'function'
        ? (operation as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(operation as Promise<unknown>[]),
    ),
  };
  const products = new ProductsService(
    prisma as never,
    {} as never,
    {} as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    stored = { ...initialProduct };
  });

  it('preserves the complete discount schedule on an unrelated PATCH', async () => {
    await products.update(
      initialProduct.id,
      await validate(UpdateProductDto, { name_en: 'Renamed' }),
    );
    expect(write).toHaveBeenCalledWith({
      where: { id: initialProduct.id },
      data: { name_en: 'Renamed' },
    });
    expect(stored).toMatchObject({ ...initialProduct, name_en: 'Renamed' });
  });

  it('uses the stored price for partial amount discounts and keeps the schedule', async () => {
    const result = await products.update(
      initialProduct.id,
      await validate(UpdateProductDto, {
        discount_type: 'amount',
        discount_value: 25,
      }),
    );
    expect(result.effective_price).toBe(75);
    expect(stored).toMatchObject({
      price: 100,
      discount_type: 'amount',
      discount_value: 25,
      discount_starts_at: initialProduct.discount_starts_at,
      discount_ends_at: initialProduct.discount_ends_at,
    });
    write.mockClear();
    const tooLarge = await validate(UpdateProductDto, {
      discount_type: 'amount',
      discount_value: 100,
    });
    await expect(
      products.update(initialProduct.id, tooLarge),
    ).rejects.toMatchObject({ status: 422 });
    expect(write).not.toHaveBeenCalled();
    expect(stored.discount_value).toBe(25);
  });

  it('allows clearing a nullable description and the whole discount definition', async () => {
    const result = await products.update(
      initialProduct.id,
      await validate(UpdateProductDto, {
        description: null,
        discount_type: null,
      }),
    );
    expect(result).toMatchObject({
      description: null,
      discount_type: null,
      discount_value: null,
      discount_starts_at: null,
      discount_ends_at: null,
      effective_price: 100,
    });
  });
});
