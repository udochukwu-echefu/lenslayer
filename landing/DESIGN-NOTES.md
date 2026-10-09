# LensLayer landing redesign

## Final direction

The landing page uses warm cream, charcoal, and soft pastel surfaces. Figtree remains the product typeface; Instrument Serif adds contrast to the hero headline. The page leads with the real workspace, then explains the contract workflow, source questions, and document controls. The workflow section uses a full-width charcoal background with light heading text.

The previews use explicitly synthetic agreements and people. No customer endorsements, logos, adoption metrics, or performance claims have been introduced.

## Figma sources and component provenance

- [Shadcn Space Hero 02](https://www.figma.com/design/tRVxXGRJcb7kDjDJJdcya6/?node-id=2262-8795): design context returned code and a screenshot. The rounded navigation (2683:3451) and inset-arrow CTA (2523:10520 / 2683:3326) are adapted into the existing React/CSS stack. Hero typography borrows its sans/italic-serif hierarchy. LensLayer content replaces the agency copy and social proof.
- `src/components/landing/hero-components.jsx` contains the adapted RoundLink. `public/references/shadcn-arrow-up-right.svg` is the exact exported Figma asset, downloaded locally so it does not depend on an expiring asset URL.
- [Template Hero Sections: Sap](https://www.figma.com/design/p47xEW7U2wGkEWi2VVZcUF/?node-id=36-2323): its centered composition informed the hero. The earlier decorative widgets and logo medallion were removed during the copy and layout cleanup.
- One Design System 3.5 (Promo), inspected in the native Figma app: neutral canvas, fine surface borders, restrained action color, and soft elevation informed the product panels. No restricted assets were copied.

## Supporting guidance

The earlier reference research included Refero, Mobbin, beUI, Rare UI, shadcn/ui, Impeccable, Emil Kowalski's skills, Transitions.dev, TasteSkill, and Skills.sh. Installed Impeccable, Emil, TasteSkill, and Figma design-to-code guidance informed hierarchy, product-specific content, accessible interactions, and restrained motion. The design combines selected ideas rather than reproducing an entire template.

## Components and behavior

- Existing LensMark/Brand geometry uses unique SVG mask IDs.
- The workspace preview is a fresh 2560 × 1600 capture of the local synthetic demo, rendered at twice the original resolution. It has no blue frame, caption, or audience strip.
- WorkflowCards shows all four stages and explanations without interaction.
- PortfolioDemo has three preset questions, readable answers, and source excerpts in a panel that fits its content.
- Document-control cards pair a title and icon with one explanation. Decorative microcopy and miniature diagrams were removed.
- Mobile navigation supports Escape, focus return, and close-on-navigation.
- CSS and WAAPI respect reduced motion. State transitions are immediate for keyboard interaction.
- The hero headline and supporting copy remain. Decorative cards, the pink medallion, and the reassurance line were removed.
- The closing logo is a small, uncropped mark aligned beside the heading on desktop and above it on mobile.

## Verification

- Production build and ESLint pass.
- Cleanup browser checks: desktop and mobile screenshots; no horizontal overflow at 320, 390, and 1440px; the high-resolution workspace image loads at its full natural dimensions.
- Rechecked all three portfolio examples and mobile menu/Escape. All workflow explanations remain visible without selection.
- Reduced-motion rules were inspected in source, not emulated at OS level.
- `VITE_APP_URL` still controls application links, defaulting to localhost:3000. Dashboard sample/converter endpoints were not running during first-pass verification; this work does not claim end-to-end verification of those routes.
- Local previews run at http://127.0.0.1:5173/ and http://127.0.0.1:3000/. The dashboard now shares the landing page's sage-and-graphite palette, and the landing hero uses a current capture of the populated demo workspace.
