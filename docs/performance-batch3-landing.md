# Landing delivery verification

Existing Figtree and italic Instrument Serif are licensed/self-hosted with upstream license/provenance and Latin/extended subsets. Critical Latin fonts are preloaded; other subsets are demand-loaded. Hero imagery has AVIF/WebP responsive candidates and a JPEG fallback, explicit dimensions, matching early responsive preload, and eager/high-priority delivery. Only initial hero copy/screenshot entrance animation was removed. Theme/carousel/navigation/FAQ and later motion remain.

Canonical build configuration is required:

```sh
npm --prefix landing ci
VITE_APP_URL=https://app.lenslayer.online npm --prefix landing run build
npm --prefix landing run check
node --test landing/scripts/delivery.test.mjs
npm --prefix landing run preview -- --host 127.0.0.1 --port 4180 --strictPort
node landing/scripts/benchmark.mjs after /absolute/evidence
PLAYWRIGHT_MODULE=/absolute/isolated/playwright/index.mjs EVIDENCE_DIR=/absolute/evidence/qa BASELINE_VISUAL=/absolute/baseline/visual.json node landing/scripts/visual-qa.mjs
```

Use the same commands/browser/version/preview port for the baseline. Three mobile Lighthouse samples are retained, with raw settings and machine configuration/build inventory in the evidence package. `VITE_APP_URL` omitted defaults to the dev localhost URL; the exploratory wrong-configuration build was **rejected by visual link checks**, rebuilt correctly, and never deployed. Only `final-canonical` is the final comparison. Earlier single-font experiments and post-font-swap CLS values are not final evidence.

The final 80 visual/interaction checks include exact copy/links, geometry within one CSS pixel, unchanged colors, 390px/DPR3 and 1440px/DPR2, font loading, one hero request, high-DPI candidate selection, WebP/JPEG decoding fallback, theme persistence/keyboard/focus, mobile menu/Escape, FAQ, carousel inert/focus/manual pause, reduced motion and canonical app links. Final screenshot review confirms the screenshot remains legible at high density; it is not replaced by an unreadable thumbnail. No prerenderer, CDN/hosting change or new runtime dependency was justified.
