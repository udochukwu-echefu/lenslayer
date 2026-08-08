# Lenslayer Landing Page

## Purpose

The landing page is a public brand surface, not a copy of the dark product workspace. It presents Lenslayer as an evidence-led document intelligence platform spanning Contract Review, Verify Onboarding, team decisions, post-signature operations, connected intake, and governance. It should communicate the same product principles with more editorial space: evidence before assertion, actionability, honest uncertainty, privacy in context, and human decision ownership.

## Visual direction

- Serious, precise B2B software with the restraint of a well-edited document.
- Asymmetric compositions, ruled ledgers, and an inspectable product view replace generic card grids.
- No gradients, glass effects, decorative glow, fabricated customer logos, or unsupported metrics.
- Motion is limited to short reveal and hover transitions and is removed for reduced-motion preferences.

## Color

Use one brand accent: deep oxide red, `oklch(0.51 0.16 30)` (approximately `#B43A2C`). It evokes redlines and precise document annotation without defaulting to legal navy or AI purple. White text on this accent exceeds WCAG AA contrast for normal text.

The supporting system is warm paper and ink:

- Page: `oklch(0.975 0.006 85)`
- Ink: `oklch(0.19 0.012 155)`
- Muted ink: `oklch(0.47 0.014 155)`
- Rule: `oklch(0.86 0.011 85)`
- Dark showcase: `oklch(0.155 0.012 155)`

## Typography

Use Figtree for every text role. The display scale uses tight tracking and a clear jump from section headings to the hero. Body copy stays between 60 and 75 characters where practical. Small labels rely on weight and spacing as well as color.

## Components

The implementation uses locally owned shadcn-style primitives with semantic CSS variables. The base is deliberately customized:

- 8px radius instead of a soft, generic card radius
- 44px minimum interactive height
- 3px visible focus rings
- flat surfaces with ruled borders and very limited shadow
- semantic background/foreground token pairs

Product simulations must show plausible workflow data and clearly read as examples. Trust claims must describe verifiable behavior rather than imply certifications or customers that are not documented.

## Responsive behavior

Wide layouts use uneven columns and intentional negative space. At tablet and mobile widths, content becomes single-column, navigation links recede, and product simulations remain horizontally legible without clipping important controls.
