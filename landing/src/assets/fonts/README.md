# Font provenance

Retrieved 2026-10-17 UTC from Google Fonts' official CSS API, unchanged WOFF2
subsets. `provenance.json` records exact binary URLs, byte sizes and SHA-256.

Request (modern Chrome user agent):

```text
https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Figtree:wght@400..700&display=swap
```

Figtree v9 normal is variable across 400–700, preserving 450, 480, 500, 520,
550, 600, 650 and 700 without synthesizing or rounding. Instrument Serif v5
is the existing 400 italic face. Normal Instrument Serif is not used by any
landing rule, so it is not shipped. Latin and Latin Extended subsets preserve
the original API's character coverage. Only the two Latin faces actually used
on the first screen are preloaded. Preloading the italic headline face avoids
a fallback line-wrap shift observed in measurement. Extended subsets are
discovered on demand by the same-origin stylesheet, never preloaded.

Both families are SIL Open Font License 1.1. Copyright and full licenses ship
in `landing/public/fonts/licenses/` (included in the built site):

- Figtree: Copyright 2022 The Figtree Project Authors,
  https://github.com/erikdkennedy/figtree
- Instrument Serif: Copyright 2022 The Instrument Serif Project Authors,
  https://github.com/Instrument/instrument-serif

License originals:
https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/OFL.txt
and https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentserif/OFL.txt.

Official guidance consulted: https://developers.google.com/fonts/faq
and https://developers.google.com/fonts/docs/css2 (variable ranges,
intermediate weights, `font-display`). Vite fingerprints the fonts; CSS and
HTML preload resolve to the same built URL. No font package is required.
