import {
  activeCoupon,
  calculateCartTotals,
  cartUnitPrice,
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
});
