import {
  activeCoupon,
  calculateCartTotals,
  cartUnitPrice,
  allocateDiscountLargestRemainder,
} from './cart-pricing';

const now = new Date('2026-09-19T12:00:00Z');

describe('server cart pricing', () => {
  it('uses the scheduled effective price and variant delta in minor units', () => {
    expect(
      cartUnitPrice(
        {
          price: '20150',
          discount_type: 'percentage',
          discount_value: '50.00',
          discount_starts_at: '2026-09-18T00:00:00Z',
          discount_ends_at: '2026-09-20T00:00:00Z',
        },
        '50',
        now,
      ),
    ).toBe(10125);
  });

  it('caps a negative variant delta at zero', () => {
    expect(cartUnitPrice({ price: '1000' }, '-2000', now)).toBe(0);
  });

  it('rounds coupon percentages half away from zero at the total boundary', () => {
    expect(
      calculateCartTotals(
        [{ unit_price: '20150', quantity: 1 }],
        {
          code: 'HALF',
          type: 'percentage',
          value: '50.00',
          usage_limit: null,
          used_count: 0,
          expires_at: null,
        },
        now,
      ),
    ).toEqual({
      subtotal: 20150,
      discount: 10075,
      coupon_discount: 10075,
      tier_discount: 0,
      discount_source: 'coupon',
      applied_tier: null,
      next_tier: null,
      delivery_fee: 0,
      total: 10075,
    });
  });

  it('caps a fixed coupon at subtotal and handles a free product', () => {
    expect(
      calculateCartTotals(
        [{ unit_price: 0, quantity: 1 }],
        {
          code: 'TEN',
          type: 'fixed',
          value: 10,
          usage_limit: null,
          used_count: 0,
          expires_at: null,
        },
        now,
      ).total,
    ).toBe(0);
  });

  it('adds the configured delivery fee after discounts', () => {
    expect(
      calculateCartTotals(
        [{ unit_price: 20000, quantity: 1 }],
        null,
        now,
        '5000',
      ),
    ).toEqual({
      subtotal: 20000,
      discount: 0,
      coupon_discount: 0,
      tier_discount: 0,
      discount_source: 'none',
      applied_tier: null,
      next_tier: null,
      delivery_fee: 5000,
      total: 25000,
    });
  });

  it('does not apply expired or exhausted coupons', () => {
    const coupon = {
      code: 'OLD',
      type: 'fixed',
      value: 5,
      usage_limit: 1,
      used_count: 1,
      expires_at: null,
    };
    expect(activeCoupon(coupon, now)).toBe(false);
    expect(
      calculateCartTotals([{ unit_price: 10, quantity: 1 }], coupon, now)
        .discount,
    ).toBe(0);
    expect(
      activeCoupon(
        { ...coupon, used_count: 0, expires_at: new Date('2026-09-18') },
        now,
      ),
    ).toBe(false);
  });

  it('applies tiers at the threshold and reports the next progress target', () => {
    const tiers = [
      { id: 'tier-10', min_subtotal_iqd: 10_000, percent: 5 },
      { id: 'tier-20', min_subtotal_iqd: 20_000, percent: 10 },
    ];
    const below = calculateCartTotals(
      [{ unit_price: 9_999, quantity: 1 }],
      null,
      now,
      0,
      tiers,
    );
    expect(below.applied_tier).toBeNull();
    expect(below.next_tier).toEqual({
      min_subtotal: 10_000,
      percent: 5,
      amount_remaining: 1,
    });

    const atThreshold = calculateCartTotals(
      [{ unit_price: 10_000, quantity: 1 }],
      null,
      now,
      0,
      tiers,
    );
    expect(atThreshold.applied_tier).toEqual({
      id: 'tier-10',
      min_subtotal: 10_000,
      percent: 5,
    });
    expect(atThreshold.tier_discount).toBe(500);
    expect(atThreshold.next_tier?.amount_remaining).toBe(10_000);
  });

  it('chooses the larger coupon or tier unless stacking is enabled', () => {
    const coupon = {
      code: 'LESS',
      type: 'fixed',
      value: 600,
      usage_limit: null,
      used_count: 0,
      expires_at: null,
    };
    const tiers = [{ id: 'tier', min_subtotal_iqd: 10_000, percent: 10 }];
    const exclusive = calculateCartTotals(
      [{ unit_price: 10_000, quantity: 1 }],
      coupon,
      now,
      0,
      tiers,
    );
    expect(exclusive).toMatchObject({
      discount: 1000,
      discount_source: 'tier',
      coupon_discount: 0,
      tier_discount: 1000,
    });
    const stacked = calculateCartTotals(
      [{ unit_price: 10_000, quantity: 1 }],
      coupon,
      now,
      0,
      tiers,
      true,
    );
    expect(stacked).toMatchObject({
      discount: 1600,
      discount_source: 'stacked',
      coupon_discount: 600,
      tier_discount: 1000,
    });
  });

  it('allocates the discount exactly with largest-remainder rounding', () => {
    const allocation = allocateDiscountLargestRemainder(
      [
        { key: 'a', line_total: 100 },
        { key: 'b', line_total: 100 },
        { key: 'c', line_total: 100 },
      ],
      100,
    );
    expect(allocation.map((line) => line.discount_share)).toEqual([34, 33, 33]);
    expect(allocation.reduce((sum, line) => sum + line.discount_share, 0)).toBe(
      100,
    );
    expect(allocation.reduce((sum, line) => sum + line.net_line_total, 0)).toBe(
      200,
    );
  });
});
