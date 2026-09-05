/* Small sRGB helpers used to derive a full brand ramp from a single tenant
   `primary_color`, and to pick readable text for it. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse #rgb / #rrggbb. Returns null for anything unparseable. */
export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Blend `color` toward `target` by `amount` (0..1). */
export function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

/** WCAG contrast ratio between two colors (1..21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Derive the brand ramp a tenant doesn't supply. Only used when a tenant sets a
 * custom primary_color — the default Shubayr green keeps the exact hexes from
 * the design sheet instead of these approximations.
 */
export function deriveBrandRamp(primaryHex: string): {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  onPrimary: string;
} | null {
  const primary = parseHex(primaryHex);
  if (!primary) return null;

  // Dark/light siblings roughly match the sheet's own spacing around #558464.
  const dark = mix(primary, BLACK, 0.28);
  const light = mix(primary, WHITE, 0.42);

  // Prefer white text; fall back to the ink color when the brand is too pale.
  const ink: Rgb = { r: 0x1f, g: 0x29, b: 0x37 };
  const onPrimary =
    contrastRatio(primary, WHITE) >= contrastRatio(primary, ink) ? WHITE : ink;

  return {
    primary: toHex(primary),
    primaryDark: toHex(dark),
    primaryLight: toHex(light),
    onPrimary: toHex(onPrimary),
  };
}
