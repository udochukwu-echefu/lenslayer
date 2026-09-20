# LensLayer Design System

## Direction

LensLayer is a focused evidence workspace for legal, procurement, compliance, and operations teams. It should feel calm, rigorous, and operational: charcoal navigation, warm paper surfaces and purposeful pastel accents, readable document surfaces, compact state treatment, and clear links from conclusions to supporting evidence.

## Color

Reference: the user-supplied dashboard image, sampled on 2026-09-14. Scene: a reviewer reading agreements at a desk in daylight, with a warm paper canvas, a charcoal navigation rail, and soft colored dividers between types of work. Preserve the user's existing light/dark preference.

Strategy: a full palette with assigned roles, supported by predominantly neutral reading surfaces. Use color in the overview and illustrative marketing surfaces; keep long documents quiet. The reference is a coordinated pastel palette, not a strict complementary or triadic scheme.

| Role | Color | Use |
| --- | --- | --- |
| Cream | `#FAF4E6` | Main canvas |
| Paper | `#FDF9F0` | Document, form and table surfaces |
| Charcoal | `#191A17` | Text, sidebar and primary actions; gently tinted from sampled `#121212` |
| Pink | `#F5B8DA` | Current navigation, decisions, AI entry point |
| Butter | `#F6D868` | Contracts and source evidence |
| Olive | `#9AA963` | Actions and retention |
| Powder blue | `#B5C9E8` | Dates and workspace previews |
| Deep rose | `#834965` | Accessible colored headings and focus in light mode |

Tokens use OKLCH; sampled hex values and conversions live in `branding/tokens/reference-pastels.json`. The active application theme is the dated block at the end of each application stylesheet. Historical branding exports are retained independently.

Use dark text on pastel fills. Avoid white labels on pastels. Muted text is deliberately darker than the reference image to improve readability. Category colors never represent risk or confidence. Status badges retain semantic colors and explicit text. Dark mode uses muted versions of the same four hues, warm charcoal surfaces, cream text, and pink actions.

Color guidance: [Adobe color relationships](https://www.adobe.com/uk/creativecloud/design/discover/color-wheel.html), [W3C text contrast](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum). Target at least 4.5:1 for normal text and 3:1 for large text; color harmony alone does not guarantee legibility. Keep neutral space dominant, match chroma across supporting accents, and use lightness contrast to establish hierarchy.

The pre-change styles, logos, product screenshot and this document are saved in `branding/theme-backups/2026-09-14-before-reference-pastels/`. See its README for a checked rollback.

## Typography

Use Figtree with a system sans-serif fallback. Page titles are direct operational labels, not marketing headlines. Letter spacing is zero. Use sentence case for navigation, headings, labels, and actions. Keep descriptions short and avoid repeated eyebrow labels.

## Layout

- Persistent 248px desktop sidebar, replaced by a grouped mobile drawer
- Navigation groups: Work, Agreements, Governance, and Administration
- Main content capped near 1180px
- Open sections separated by whitespace and thin dividers
- Cards reserved for independent records or framed tools
- Compact contextual empty, error, restricted, and partial-data states
- Calendar switches to an agenda on small screens
- Reports reveal sections only when supporting records exist

## Components

- Interactive targets: at least 44 by 44px for important controls
- Buttons and inputs: 8 to 10px radius
- Major independent panels: 12 to 14px radius
- Status indicators: text plus semantic color, never color alone
- Findings: severity, recommendation label, source excerpt, and evidence status
- Human decisions: reviewer identity, rationale, and timestamp
- Search: global retrieval is distinct from register filtering
- Public preview: clearly synthetic, read-only, and isolated from customer workspaces
- Empty states: one useful sentence and only an action the current role can perform
- Loading skeletons: approximate the destination layout

## Evidence Behavior

Every material finding and generated answer links to a source excerpt. Unsupported answers are blocked. Automated recommendations never masquerade as decisions, and confidence never replaces evidence status. Reports distinguish automated findings from attributable human outcomes.

## Motion

Use 150 to 220ms state transitions for feedback only. Respect `prefers-reduced-motion` and do not animate layout properties.
