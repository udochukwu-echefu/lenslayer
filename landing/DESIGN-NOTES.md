# LensLayer landing redesign

## Final direction

The landing page uses warm cream, charcoal, and soft pastel surfaces. Figtree remains the product typeface; Instrument Serif adds contrast to the hero headline. The page leads with the demo workspace's Overview, then covers the review workflow, source-linked questions, renewal dates and reminders, and document privacy. Since November 2026 it no longer pitches agents, the SDK, the developer guide or the document converter, which are frozen in the dashboard. The workflow section uses a full-width charcoal background with light heading text.

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
- The workspace preview is a 1728 × 908 capture of the Overview page in the synthetic demo workspace, taken from the dashboard with the five-item contract navigation (Overview, Agreements, Ask, Renewals, Settings). `scripts/generate-hero.mjs` builds the `overview-v2-*` AVIF and WebP variants from `public/lenslayer-overview.jpg`.
- How it works (November 2026) follows a reference the owner supplied: a small centred eyebrow, a large centred statement with round icon badges set into the text and a greyed last line, then a four-card grid. The cards are a tall blue card with a cropped screenshot of the real Renewals calendar under a white figure card, a grey card with the demo team's initials and a real demo comment, a yellow card and a small dark card. The reference filled these with invented stats, stock photos and a testimonial; here every figure is a product or demo fact (60 days' notice, 4 ways to answer a review request, 3 file types, reminders up to 90 days ahead), and the quote is a comment from the demo workspace.
- AskDemo replaced the tilted, auto-rotating card carousel in November 2026. It follows the layered product-fragment rows on Perplexity Enterprise: copy and an outlined button on the left, and on the right a soft-blue stage holding a white answer card that bleeds off the right edge. The question sits in a chat bubble. Each line of the answer ends in a clause chip, and the selected chip's source card overlaps the bottom of the answer card, quoting the clause with the deciding words highlighted and linking to the contract in the demo. The Fieldnote line shows the answer admitting a contract it couldn't read. An earlier flat, ruled answer sheet was dropped because it read as a form rather than a product.
- The page grain sits at 14% opacity, down 30% from 20%.
- Renewal cards pair a title and icon with one explanation. The privacy card restates the privacy policy in three points and links to `/privacy` and `/terms`.
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
