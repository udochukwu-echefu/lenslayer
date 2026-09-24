# LensLayer landing redesign

## Final direction

Warm white, charcoal, and restrained sage replace the original cobalt surfaces across the landing page and dashboard. Figtree remains the product typeface; Instrument Serif adds contrast to the hero headline. The page leads with a clear promise, then demonstrates the real workspace, source evidence, suggested positions, human decisions, the contract lifecycle, portfolio questions, and document controls.

The previews use explicitly synthetic agreements and people. No customer endorsements, logos, adoption metrics, or performance claims have been introduced.

## Figma sources and component provenance

- [Shadcn Space Hero 02](https://www.figma.com/design/tRVxXGRJcb7kDjDJJdcya6/?node-id=2262-8795): design context returned code and a screenshot. The rounded navigation (2683:3451) and inset-arrow CTA (2523:10520 / 2683:3326) are adapted into the existing React/CSS stack. Hero typography borrows its sans/italic-serif hierarchy. LensLayer content replaces the agency copy and social proof.
- `src/components/landing/hero-components.jsx` contains the adapted RoundLink. `public/references/shadcn-arrow-up-right.svg` is the exact exported Figma asset, downloaded locally so it does not depend on an expiring asset URL.
- [Template Hero Sections: Sap](https://www.figma.com/design/p47xEW7U2wGkEWi2VVZcUF/?node-id=36-2323): inspected the cover screenshot and node metadata. Its centered composition, logo medallion, and surrounding compact widgets informed the hero. The requested detailed sublayer exports hit Figma's Starter-plan MCP quota; these widgets are locally authored adaptations, not direct exported component code. Their text and clause reference match the interactive LensLayer review.
- One Design System 3.5 (Promo), inspected in the native Figma app: neutral canvas, fine surface borders, restrained action color, and soft elevation informed the product panels. No restricted assets were copied.

## Supporting guidance

The earlier reference research included Refero, Mobbin, beUI, Rare UI, shadcn/ui, Impeccable, Emil Kowalski's skills, Transitions.dev, TasteSkill, and Skills.sh. Installed Impeccable, Emil, TasteSkill, and Figma design-to-code guidance informed hierarchy, product-specific content, accessible interactions, and restrained motion. The design combines selected ideas rather than reproducing an entire template.

## Components and behavior

- Existing LensMark/Brand geometry uses unique SVG mask IDs.
- ReviewDemo has finding, next-move, and human-decision states; arrow keys, Home, and End support keyboard navigation.
- WorkflowDemo has four selectable stages, including revisions, decisions, and tasks.
- PortfolioDemo has three preset questions with different answers and source excerpts.
- Native details/summary elements disclose document controls.
- Mobile navigation supports Escape, focus return, and close-on-navigation.
- CSS and WAAPI respect reduced motion. State transitions are immediate for keyboard interaction.
- Decorative hero widgets disappear below 1200px; the functional source review remains available at every width.

## Verification

- Production build and ESLint pass.
- Second-pass browser checks: desktop and mobile screenshots; no horizontal overflow at 320, 390, 560, 768, 1024, and 1440px; exported images load; no console warnings or errors.
- Rechecked the review next-move state, arrow-key decision selection, negotiation workflow, termination portfolio answer, and mobile menu/Escape. All remaining demo states were exercised in the first pass; their logic is unchanged.
- Reduced-motion rules were inspected in source, not emulated at OS level.
- `VITE_APP_URL` still controls application links, defaulting to localhost:3000. Dashboard sample/converter endpoints were not running during first-pass verification; this work does not claim end-to-end verification of those routes.
- Local previews run at http://127.0.0.1:5173/ and http://127.0.0.1:3000/. The dashboard now shares the landing page's sage-and-graphite palette, and the landing hero uses a current capture of the populated demo workspace.
