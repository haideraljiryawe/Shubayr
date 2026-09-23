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
          price: '20.15',
          discount_type: 'percentage',
          discount_value: '50.00',
          discount_starts_at: '2026-09-18T00:00:00Z',
          discount_ends_at: '2026-09-20T00:00:00Z',
        },
        '0.05',
        now,
      ),
    ).toBe(10.13);
  });

  it('caps a negative variant delta at zero', () => {
    expect(cartUnitPrice({ price: '1.00' }, '-2.00', now)).toBe(0);
  });

  it('rounds coupon percentages half away from zero at the total boundary', () => {
    expect(
      calculateCartTotals(
        [{ unit_price: '20.15', quantity: 1 }],
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
      subtotal: 20.15,
      discount: 10.08,
      delivery_fee: 0,
      total: 10.07,
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
