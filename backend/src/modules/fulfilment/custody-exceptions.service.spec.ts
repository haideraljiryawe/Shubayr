import { custodyExceptionBusinessDate } from './custody-exception-date';

describe('custody exception business date', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['2026-10-31T20:59:59.000Z', '2026-10-31'],
    ['2026-10-31T21:00:00.000Z', '2026-11-01'],
    ['2026-10-31T23:30:00.000Z', '2026-11-01'],
  ])(
    'dates a reversal at %s by the Baghdad business day',
    (instant, expected) => {
      jest.useFakeTimers().setSystemTime(new Date(instant));
      expect(custodyExceptionBusinessDate()).toBe(expected);
    },
  );
});
