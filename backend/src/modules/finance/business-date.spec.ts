import {
  businessDate,
  businessDateText,
  businessDateYear,
  businessDayEnd,
  businessDayStart,
  exchangeRateCutoff,
} from './business-date';

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

  it('maps the 00:00-03:00 Baghdad window on the first of a month', () => {
    const instant = new Date('2026-10-31T22:30:00.000Z');

    expect(businessDateText(instant)).toBe('2026-11-01');
    expect(businessDayStart('2026-11-01')).toEqual(
      new Date('2026-10-31T21:00:00.000Z'),
    );
    expect(businessDayEnd('2026-11-01')).toEqual(
      new Date('2026-11-01T20:59:59.999Z'),
    );
  });

  it('uses the Baghdad year for instant-based document numbering', () => {
    expect(businessDateYear(new Date('2026-12-31T22:00:00.000Z'))).toBe(2027);
  });

  it('caps current and future documents at posting time', () => {
    const postedAt = new Date('2026-10-03T11:05:00.000Z');

    expect(
      exchangeRateCutoff(new Date('2026-10-03T00:00:00.000Z'), postedAt),
    ).toEqual(postedAt);
    expect(
      exchangeRateCutoff(new Date('2026-10-04T00:00:00.000Z'), postedAt),
    ).toEqual(postedAt);
  });
});
