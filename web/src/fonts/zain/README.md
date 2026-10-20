# Zain (web store typeface)

The store's three faces come from the app's own fonts, `mobile/assets/fonts`
(`Zain-Regular.ttf` 400, `Zain-Bold.ttf` 700, `Zain-ExtraBold.ttf` 800; SIL Open
Font License, copied here as `OFL.txt`). Those originals are left untouched.

## How these files were made

Each TTF was converted to WOFF2 and subset with HarfBuzz's subsetter
(`subset-font` 2.x, which wraps `harfbuzzjs`), keeping every glyph the font maps
in these ranges:

| Range | Why |
|---|---|
| U+0020–007E, U+00A0–00FF | Basic Latin and Latin-1: English text, Western digits, punctuation |
| U+0100–024F, U+02B0–02FF, U+0370–03FF | accented Latin in names and imported text, modifiers, µ |
| U+0600–06FF | Arabic letters, harakat, Arabic-Indic and Extended Arabic-Indic digits, Arabic punctuation |
| U+2000–206F | general punctuation (dashes, quotes, …, •) |
| U+20A0–20C0, U+2100–214F, U+2200–22FF | currency signs, ™, − ≤ ≥ ≠ |
| U+25CC | the dotted circle a lone haraka is shown on |
| U+FB50–FDFF, U+FE70–FEFF | Arabic presentation forms |

Only the private-use glyphs (U+E000–F8FF), U+FFFF and a stray U+000D were left
out; nothing in the ranges above was lost. The layout tables survive with
their features — `ccmp`, `locl`, `init`, `medi`, `fina`, `rlig`, `liga`,
`mark`, `mkmk`, `kern` and the numeral features — so Arabic shapes and
harakat sit exactly as in the TTFs. Each face is about 50 KB (from about
180 KB).

Zain has no glyphs for the invisible joiners and direction marks (ZWJ, ZWNJ,
LRM, RLM). Browsers handle those without a glyph, so they need none.

To regenerate, run `subset-font` on each TTF with the text of every code point
the font maps in those ranges, `targetFormat: "woff2"`.
