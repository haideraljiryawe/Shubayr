import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  applyBilingualNameFallback,
  resolveLocalizedName,
} from './bilingual-name';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateProductDto } from './dto/update-product.dto';

describe('admin bilingual-name validation', () => {
  it.each([
    ['create product', CreateProductDto],
    ['create category', CreateCategoryDto],
  ])('rejects %s with only name_ar and identifies name_en', async (_, Dto) => {
    // A valid price keeps the product DTOs' pricing rules out of the way.
    const input = plainToInstance(Dto as new () => object, {
      name_ar: 'اسم عربي',
      price: 10,
    });
    const errors = await validate(input);
    const englishName = errors.find(({ property }) => property === 'name_en');

    expect(englishName).toBeDefined();
    expect(Object.values(englishName?.constraints ?? {}).join(' ')).toContain(
      'name_en',
    );
  });

  it('allows update product to patch one language without restating the other', async () => {
    const input = plainToInstance(UpdateProductDto, { name_ar: 'اسم محدث' });
    await expect(validate(input)).resolves.toEqual([]);
  });

  it('allows update category to patch one language without restating the other', async () => {
    const input = plainToInstance(UpdateCategoryDto, { name_ar: 'Updated' });
    await expect(validate(input)).resolves.toEqual([]);
  });

  it.each([
    ['create product', CreateProductDto],
    ['update product', UpdateProductDto],
    ['create category', CreateCategoryDto],
    ['update category', UpdateCategoryDto],
  ])('rejects blank names for %s', async (_, Dto) => {
    const input = plainToInstance(Dto as new () => object, {
      name_ar: '   ',
      name_en: '',
      price: 10,
    });
    const errors = await validate(input);

    expect(
      errors
        .map(({ property }) => property)
        .filter((property) => property.startsWith('name_'))
        .sort(),
    ).toEqual(['name_ar', 'name_en']);
  });
});

describe('bilingual-name read fallback', () => {
  it('returns Arabic under locale=en when English is empty', () => {
    expect(resolveLocalizedName({ name_ar: 'تفاح', name_en: '' }, 'en')).toBe(
      'تفاح',
    );
  });

  it('returns English under locale=ar when Arabic is empty', () => {
    expect(
      resolveLocalizedName({ name_ar: ' ', name_en: 'Apples' }, 'ar'),
    ).toBe('Apples');
  });

  it('normalizes nested product and category response names', () => {
    const response = applyBilingualNameFallback({
      data: [{ name_ar: 'هاتف', name_en: '' }],
      category: { name_ar: '', name_en: 'Electronics' },
    });

    expect(response.data[0]).toEqual({ name_ar: 'هاتف', name_en: 'هاتف' });
    expect(response.category).toEqual({
      name_ar: 'Electronics',
      name_en: 'Electronics',
    });
  });
});
