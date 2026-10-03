import localFont from "next/font/local";

/* ---------------------------------------------------------------------------
 * Cairo, self-hosted (SIL Open Font License, see OFL.txt) — shared by the web
 * store and the Web Admin, so neither build downloads Google Fonts.
 *
 * These are the exact files Google Fonts serves for Cairo 300–700 (one
 * variable font per subset), with Google's unicode-ranges: a browser only
 * downloads a subset when the page uses a character from it, as before.
 * next/font gives each face its own family name, so tokens.css lists the
 * three in order (`--font-sans`); only the last carries the metric-adjusted
 * fallback, so no system font steps in front of a Cairo subset.
 * ------------------------------------------------------------------------- */

export const cairoArabic = localFont({
  src: "./cairo-arabic.woff2",
  weight: "300 700",
  style: "normal",
  display: "swap",
  variable: "--font-cairo-arabic",
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F, U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37, U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F, U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F, U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77, U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3, U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1",
    },
  ],
});

export const cairoLatinExt = localFont({
  src: "./cairo-latin-ext.woff2",
  weight: "300 700",
  style: "normal",
  display: "swap",
  variable: "--font-cairo-latin-ext",
  adjustFontFallback: false,
  // Rarely needed (accented Latin): not worth a preload on every page.
  preload: false,
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
});

export const cairoLatin = localFont({
  src: "./cairo-latin.woff2",
  weight: "300 700",
  style: "normal",
  display: "swap",
  variable: "--font-cairo-latin",
  // The metric-adjusted fallback (as next/font/google generated) lives here,
  // at the end of the stack.
  adjustFontFallback: "Arial",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
});

/** All three on <html>: they define the variables tokens.css reads. */
export const cairoVariables = `${cairoArabic.variable} ${cairoLatinExt.variable} ${cairoLatin.variable}`;
