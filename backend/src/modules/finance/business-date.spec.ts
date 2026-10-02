import { businessDate } from './business-date';

describe('businessDate', () => {
  it('uses the Baghdad calendar date across the UTC month boundary', () => {
    expect(businessDate(new Date('2026-10-31T20:59:59.999Z'))).toEqual(
      new Date('2026-10-31T00:00:00.000Z'),
    );
    expect(businessDate(new Date('2026-10-31T21:00:00.000Z'))).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
    expect(businessDate(new Date('2026-10-31T22:30:00.000Z'))).toEqual(
      new Date('2026-11-01T00:00:00.000Z'),
    );
  });
});
