# Design

`shubayr-design-system.jpeg` is the Shubayr design sheet — the source of truth
for the palette, typography, radii and base components. `web/src/app/globals.css`
implements it as CSS tokens, and `/style-guide` in the web app renders every
token and component for comparison against it.

## One known discrepancy

The sheet prints **`#5BBF6B`** beside the Primary swatch, but the swatch itself —
and every mockup screen (buttons, bottom-tab circle, profile header) — renders
**`#558464`**. The sage is the real brand colour and the printed label is a typo;
`#5BBF6B` also fails WCAG AA against white (2.31:1, vs 4.31:1 for the sage).

`--t-primary` is therefore `#558464`. Both are shown side by side on
`/style-guide` under «ملاحظة حول اللون الأساسي» so the decision stays visible.

Filled call-to-action buttons use `--t-primary-dark` (6.14:1 on white) rather
than `--t-primary`, so button labels clear AA at body size.
