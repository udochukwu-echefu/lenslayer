# LensLayer Design System

## Direction

LensLayer is a focused evidence workspace for legal, procurement, compliance, and operations teams. It should feel calm, rigorous, and operational: restrained blue navigation, readable document surfaces, compact state treatment, and clear links from conclusions to supporting evidence.

## Color

- Canvas: `#F4F6F9`
- Primary surface: `#FAFBFC`
- Raised surface: `#EBEFF4`
- Quiet border: `#D5DCE5`
- Strong border: `#B8C3D0`
- Primary text: `#18243A`
- Muted text: `#526174`
- Sidebar ink blue: `#1D304A`
- Action and selection cobalt: `#3159B8`
- Cobalt hover: `#274A9D`
- Success: `#477458`
- Warning: `#986D24`
- Error: `#B4544D`

Use cobalt for primary actions, focus, and the current selection only. Ordinary sections and fields use neutral surface contrast and quiet borders. Do not use gradients, glows, glass effects, or decorative shadows.

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
- Findings: severity, recommendation label, source excerpt, and verification state
- Human decisions: reviewer identity, rationale, and timestamp
- Search: global retrieval is distinct from register filtering
- Public preview: clearly synthetic, read-only, and isolated from customer workspaces
- Empty states: one useful sentence and only an action the current role can perform
- Loading skeletons: approximate the destination layout

## Evidence Behavior

Every material finding and generated answer links to a source excerpt. Unsupported answers are blocked. Automated recommendations never masquerade as decisions, and confidence never replaces verification status. Reports distinguish automated findings from attributable human outcomes.

## Motion

Use 150 to 220ms state transitions for feedback only. Respect `prefers-reduced-motion` and do not animate layout properties.
