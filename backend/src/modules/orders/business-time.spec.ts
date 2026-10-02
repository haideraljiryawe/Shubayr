import { addBusinessMinutes } from './business-time';

const hours = [
  { weekday: 0, opens_at: '09:00', closes_at: '17:00', is_closed: false },
  { weekday: 1, opens_at: null, closes_at: null, is_closed: true },
  { weekday: 2, opens_at: '09:00', closes_at: '17:00', is_closed: false },
  { weekday: 3, opens_at: '09:00', closes_at: '17:00', is_closed: false },
  { weekday: 4, opens_at: '09:00', closes_at: '17:00', is_closed: false },
  { weekday: 5, opens_at: '09:00', closes_at: '17:00', is_closed: false },
  { weekday: 6, opens_at: '09:00', closes_at: '17:00', is_closed: false },
];

describe('business-time deadlines', () => {
  it('skips a closed weekday in Asia/Baghdad', () => {
    // Sunday 16:30 Baghdad + 90 business minutes => Tuesday 10:00.
    expect(
      addBusinessMinutes(
        new Date('2026-10-04T13:30:00.000Z'),
        90,
        hours,
        new Set(),
      ).toISOString(),
    ).toBe('2026-10-06T07:00:00.000Z');
  });

  it('continues across Baghdad midnight and skips an explicit closed date', () => {
    expect(
      addBusinessMinutes(
        new Date('2026-10-06T13:30:00.000Z'),
        120,
        hours,
        new Set(['2026-10-07']),
      ).toISOString(),
    ).toBe('2026-10-08T07:30:00.000Z');
  });
});
