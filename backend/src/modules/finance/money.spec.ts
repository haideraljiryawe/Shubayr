import {
  decimalPlaces,
  decimalToScaled,
  roundForCurrency,
  scaledToDecimal,
} from './money';

describe('exact currency arithmetic', () => {
  it('rounds IQD at zero decimals without binary floating point', () => {
    expect(roundForCurrency('1250.5', 0)).toBe(1251);
    expect(roundForCurrency('1250.49', 0)).toBe(1250);
  });

  it('preserves USD cents and exact scaled conversion', () => {
    expect(decimalToScaled('12.345', 2)).toBe(1235n);
    expect(scaledToDecimal(1235n, 2)).toBe('12.35');
    expect(decimalPlaces('12.3400')).toBe(2);
  });
});
