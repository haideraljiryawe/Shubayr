type Decimalish = number | string | { toString(): string };

function parts(value: Decimalish): {
  negative: boolean;
  whole: string;
  fraction: string;
} {
  const text = value.toString().trim();
  const match = text.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new TypeError(`Invalid decimal value: ${text}`);
  return {
    negative: match[1] === '-',
    whole: match[2],
    fraction: match[3] ?? '',
  };
}

export function decimalToScaled(value: Decimalish, scale: number): bigint {
  const parsed = parts(value);
  const kept = parsed.fraction.slice(0, scale).padEnd(scale, '0');
  let result = BigInt(`${parsed.whole}${kept}`);
  if ((parsed.fraction[scale] ?? '0') >= '5') result += 1n;
  return parsed.negative ? -result : result;
}

export function scaledToDecimal(value: bigint, scale: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  if (scale === 0) return `${negative ? '-' : ''}${absolute}`;
  const digits = absolute.toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export function roundForCurrency(value: Decimalish, precision: number): number {
  return Number(scaledToDecimal(decimalToScaled(value, precision), precision));
}

export function decimalPlaces(value: Decimalish): number {
  return parts(value).fraction.replace(/0+$/, '').length;
}
