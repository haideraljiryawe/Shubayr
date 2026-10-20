import localFont from "next/font/local";

/* ---------------------------------------------------------------------------
 * Zain, the store's typeface (NOTE-009; SIL Open Font License, see OFL.txt) —
 * the same three static faces the app uses (mobile/assets/fonts), converted
 * to WOFF2 and subset as README.md records. The Web Admin keeps Cairo.
 *
 * Only real faces are declared: 400 and 700 (every regular and bold in the
 * store, preloaded — they are above the fold on every page), and 800 on its
 * own family, not preloaded, for display text that asks for it explicitly
 * (`font-zain-extrabold`). 300/500/600 are mapped to 400/700 in globals.css,
 * so no weight is ever synthesised or faked from a variable range.
 * ------------------------------------------------------------------------- */

export const zain = localFont({
  src: [
    { path: "./zain-400.woff2", weight: "400", style: "normal" },
    { path: "./zain-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-zain",
  // A metric-adjusted Arial stands in until Zain arrives, so the swap barely moves text.
  adjustFontFallback: "Arial",
});

export const zainExtraBold = localFont({
  src: [{ path: "./zain-800.woff2", weight: "800", style: "normal" }],
  display: "swap",
  variable: "--font-zain-800",
  preload: false,
  adjustFontFallback: "Arial",
});

/** Both on <html>: they define the variables globals.css reads. */
export const zainVariables = `${zain.variable} ${zainExtraBold.variable}`;
