import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  activeDiscountWhere,
  computeProductPricing,
  isDiscountActive,
} from './pricing';

const JANUARY = new Date('2026-01-15T12:00:00Z');
const FEBRUARY = new Date('2026-02-15T12:00:00Z');
const MARCH = new Date('2026-03-15T12:00:00Z');

describe('percentage discount math', () => {
  it('takes the percentage off the regular price', () => {
    expect(
      computeProductPricing(
        { price: 100, discount_type: 'percentage', discount_value: 10 },
        FEBRUARY,
      ),
    ).toEqual({
      on_sale: true,
      discounted_price: 90,
      effective_price: 90,
      discount_percent: 10,
    });
  });

  it('rounds the discounted price to two decimals', () => {
    // 19.99 * 0.85 = 16.9915
    expect(
      computeProductPricing(
        { price: 19.99, discount_type: 'percentage', discount_value: 15 },
        FEBRUARY,
      ),
    ).toMatchObject({ discounted_price: 16.99, effective_price: 16.99 });
  });

  it('reads Prisma Decimal-style values', () => {
    expect(
      computeProductPricing(
        {
          price: { toString: () => '250.00' },
          discount_type: 'percentage',
          discount_value: { toString: () => '20.00' },
        },
        FEBRUARY,
      ),
    ).toMatchObject({ discounted_price: 200, discount_percent: 20 });
  });

  it('reports a full discount as 100 percent and a zero effective price', () => {
    expect(
      computeProductPricing(
        { price: 40, discount_type: 'percentage', discount_value: 100 },
        FEBRUARY,
      ),
    ).toEqual({
      on_sale: true,
      discounted_price: 0,
      effective_price: 0,
      discount_percent: 100,
    });
  });
});

describe('amount discount math', () => {
  it('subtracts the amount from the regular price', () => {
    expect(
      computeProductPricing(
        { price: 250, discount_type: 'amount', discount_value: 40 },
        FEBRUARY,
      ),
    ).toEqual({
      on_sale: true,
      discounted_price: 210,
      effective_price: 210,
      discount_percent: 16,
    });
  });

  it('never lets an amount discount push the price below zero', () => {
    // The DB and DTO both reject value >= price, so this only guards a row
    // whose price was lowered after the discount was written.
    expect(
      computeProductPricing(
        { price: 30, discount_type: 'amount', discount_value: 45 },
        FEBRUARY,
      ),
    ).toMatchObject({ discounted_price: 0, effective_price: 0 });
  });

  it('rounds discount_percent to a whole number', () => {
    // 3.33 / 10 = 33.3%
    expect(
      computeProductPricing(
        { price: 10, discount_type: 'amount', discount_value: 3.33 },
        FEBRUARY,
      ),
    ).toMatchObject({ discounted_price: 6.67, discount_percent: 33 });
  });
});

describe('scheduled discount windows', () => {
  const scheduled = {
    price: 200,
    discount_type: 'percentage',
    discount_value: 25,
    discount_starts_at: '2026-02-01T00:00:00Z',
    discount_ends_at: '2026-02-28T23:59:59Z',
  };

  it('is active inside its window', () => {
    expect(computeProductPricing(scheduled, FEBRUARY)).toEqual({
      on_sale: true,
      discounted_price: 150,
      effective_price: 150,
      discount_percent: 25,
    });
  });

  it('is not active before the window opens', () => {
    expect(computeProductPricing(scheduled, JANUARY)).toEqual({
      on_sale: false,
      discounted_price: null,
      effective_price: 200,
      discount_percent: null,
    });
  });

  it('is not active after the window closes', () => {
    expect(computeProductPricing(scheduled, MARCH)).toEqual({
      on_sale: false,
      discounted_price: null,
      effective_price: 200,
      discount_percent: null,
    });
  });

  it('treats a null start as active immediately and a null end as open-ended', () => {
    const openEnded = {
      price: 80,
      discount_type: 'amount',
      discount_value: 8,
      discount_starts_at: null,
      discount_ends_at: null,
    };

    expect(isDiscountActive(openEnded, JANUARY)).toBe(true);
    expect(isDiscountActive(openEnded, MARCH)).toBe(true);
  });

  it('honours a one-sided window', () => {
    const startsOnly = {
      price: 80,
      discount_type: 'amount',
      discount_value: 8,
      discount_starts_at: '2026-02-01T00:00:00Z',
    };

    expect(isDiscountActive(startsOnly, JANUARY)).toBe(false);
    expect(isDiscountActive(startsOnly, MARCH)).toBe(true);
  });
});

describe('products with no discount', () => {
  it('charges the regular price', () => {
    expect(computeProductPricing({ price: 12.5 }, FEBRUARY)).toEqual({
      on_sale: false,
      discounted_price: null,
      effective_price: 12.5,
      discount_percent: null,
    });
  });

  it('ignores an unknown discount_type', () => {
    expect(
      computeProductPricing(
        { price: 12.5, discount_type: 'bogus', discount_value: 5 },
        FEBRUARY,
      ),
    ).toMatchObject({ on_sale: false, effective_price: 12.5 });
  });
});

describe('on_sale query filter', () => {
  it('restricts to defined discounts whose window contains the given instant', () => {
    expect(activeDiscountWhere(FEBRUARY)).toEqual({
      discount_type: { in: ['percentage', 'amount'] },
      AND: [
        {
          OR: [
            { discount_starts_at: null },
            { discount_starts_at: { lte: FEBRUARY } },
          ],
        },
        {
          OR: [
            { discount_ends_at: null },
            { discount_ends_at: { gte: FEBRUARY } },
          ],
        },
      ],
    });
  });
});

describe('admin discount validation', () => {
  const base = { category_id: 'c', name_ar: 'تفاح', name_en: 'Apples' };
  const propertiesOf = async (payload: Record<string, unknown>) => {
    const errors = await validate(
      plainToInstance(CreateProductDto, { ...base, ...payload }),
    );
    return errors.map(({ property }) => property).sort();
  };

  it('accepts a product with no discount at all', async () => {
    await expect(propertiesOf({ price: 10 })).resolves.toEqual([]);
  });

  it('accepts a valid percentage discount with a window', async () => {
    await expect(
      propertiesOf({
        price: 10,
        discount_type: 'percentage',
        discount_value: 25,
        discount_starts_at: '2026-02-01T00:00:00Z',
        discount_ends_at: '2026-02-28T00:00:00Z',
      }),
    ).resolves.toEqual([]);
  });

  it('requires a discount_value once discount_type is set', async () => {
    await expect(
      propertiesOf({ price: 10, discount_type: 'amount' }),
    ).resolves.toEqual(['discount_value']);
  });

  it('rejects a non-positive discount_value', async () => {
    await expect(
      propertiesOf({
        price: 10,
        discount_type: 'percentage',
        discount_value: 0,
      }),
    ).resolves.toEqual(['discount_value']);
  });

  it('rejects a percentage above 100', async () => {
    await expect(
      propertiesOf({
        price: 10,
        discount_type: 'percentage',
        discount_value: 100.5,
      }),
    ).resolves.toEqual(['discount_value']);
  });

  it('rejects an amount that is not less than the price', async () => {
    await expect(
      propertiesOf({ price: 10, discount_type: 'amount', discount_value: 10 }),
    ).resolves.toEqual(['discount_value']);
  });

  it('rejects a stray discount_value with no discount_type', async () => {
    await expect(
      propertiesOf({ price: 10, discount_value: 5 }),
    ).resolves.toEqual(['discount_value']);
  });

  it('rejects an unknown discount_type', async () => {
    await expect(
      propertiesOf({ price: 10, discount_type: 'bogo', discount_value: 5 }),
    ).resolves.toEqual(['discount_type']);
  });

  it('rejects a window that ends before it starts', async () => {
    await expect(
      propertiesOf({
        price: 10,
        discount_type: 'percentage',
        discount_value: 25,
        discount_starts_at: '2026-02-28T00:00:00Z',
        discount_ends_at: '2026-02-01T00:00:00Z',
      }),
    ).resolves.toEqual(['discount_ends_at']);
  });

  it('requires a price', async () => {
    await expect(propertiesOf({})).resolves.toEqual(['price']);
  });

  it('rejects a negative price', async () => {
    await expect(propertiesOf({ price: -1 })).resolves.toEqual(['price']);
  });

  it('applies the same rules to updates', async () => {
    const errors = await validate(
      plainToInstance(UpdateProductDto, {
        ...base,
        price: 10,
        discount_type: 'amount',
        discount_value: 10,
      }),
    );

    expect(errors.map(({ property }) => property)).toEqual(['discount_value']);
  });
});
