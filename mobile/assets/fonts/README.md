# Fonts

The UI font is **Cairo**, loaded from local assets only — the app must never
fetch fonts over the network at runtime.

The four weights are bundled here and declared in `pubspec.yaml`:

```
assets/fonts/Cairo-Regular.ttf    (weight 400)
assets/fonts/Cairo-Medium.ttf     (weight 500)
assets/fonts/Cairo-SemiBold.ttf   (weight 600)
assets/fonts/Cairo-Bold.ttf       (weight 700)
```

These are the only weights `AppTypography` uses, so nothing is synthesised.

Cairo is licensed under the SIL Open Font License 1.1 — see `OFL.txt` in this
directory. Upstream: <https://fonts.google.com/specimen/Cairo>.

`AppTypography.fontFamily` names the family in one place; add a weight here and
in `pubspec.yaml` together.
