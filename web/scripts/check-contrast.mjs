import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Composite in sRGB before calculating linear-light WCAG luminance.
// A transparent background contributes its ancestors, not opaque black.
function composite(foreground, background) {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    ...foreground.slice(0, 3).map((channel, index) =>
      (channel * foreground[3] +
        background[index] * background[3] * (1 - foreground[3])) / alpha,
    ),
    alpha,
  ];
}

function luminance(color) {
  assert.equal(color[3], 1, "Composite onto an opaque canvas first");
  const channels = color.slice(0, 3).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background, canvas = [255, 255, 255, 1]) {
  const surface = composite(background, canvas);
  const text = composite(foreground, surface);
  const a = luminance(text);
  const b = luminance(surface);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Regression checks for transparent ancestors and translucent text.
assert.deepEqual(composite([0, 0, 0, 0], [244, 241, 234, 1]), [244, 241, 234, 1]);
assert.deepEqual(composite([0, 0, 0, 0.5], [255, 255, 255, 1]), [127.5, 127.5, 127.5, 1]);
assert.equal(contrast([0, 0, 0, 1], [0, 0, 0, 0]), 21);
assert.ok(Math.abs(contrast([0, 0, 0, 0.5], [255, 255, 255, 1]) - 3.97665) < 0.00001);

const css = readFileSync(new URL("../src/app/tokens.css", import.meta.url), "utf8");
function token(name) {
  const hex = css.match(new RegExp(`--t-${name}:\\s*#([0-9a-f]{6}(?:[0-9a-f]{2})?)\\s*;`, "i"))?.[1];
  assert.ok(hex, `Missing hex token: --t-${name}`);
  return [
    ...[0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)),
    hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1,
  ];
}

for (const surface of ["card", "background"]) {
  const ratio = contrast(token("text-muted"), token(surface));
  console.log(`text-text-muted on bg-${surface}: ${ratio.toFixed(4)}:1`);
  assert.ok(ratio >= 4.5, `WCAG AA failed on bg-${surface}`);
}
