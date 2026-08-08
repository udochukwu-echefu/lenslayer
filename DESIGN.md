# Lenslayer Design System

## Direction

A bright, precise product workspace inspired by a well-lit review desk and blue annotation ink. Cool white working surfaces keep long documents readable, a deep-blue navigation rail anchors the application, and clear blue actions make the next step easy to find. Semantic risk colors remain independent from the brand palette.

## Color

- Main canvas: `#F8FBFF`
- Cloud secondary background: `#E3F2FD`
- Sky border and quiet emphasis: `#90CAF9`
- Bright blue active signal: `#2196F3`
- Deep blue navigation and primary action: `#0D47A1`
- Accessible blue hover and text accent: `#1565C0`
- Primary text: `#102A43`
- Muted text: `#486581`
- High risk: `#A8453C`
- Medium risk: `#946515`
- Previous botanical green theme backup: `branding/theme-backups/2026-08-02-botanical-green/`
- Previous dark coral theme backup: `branding/theme-backups/2026-07-29-dark-coral/`

## Typography

Use Figtree for interface and display text with a system sans-serif fallback. Body copy is 0.95 to 1rem at 1.55 line height. Labels use 0.72 to 0.78rem uppercase text with moderate tracking. Long prose is capped near 70 characters.

## Layout

- Persistent 248px sidebar on desktop, replaced by a mobile drawer at smaller breakpoints
- Main content capped near 1180px
- New-review setup is a primary main-page workflow: upload, review context, policy, privacy, consent, then action
- Sidebar is secondary navigation only: account, current review controls, and saved review history
- Compact report summary strip, not oversized metric cards
- Sticky report navigation where platform behavior allows
- Single-column risk and evidence reading flow
- Responsive breakpoints at 900px and 640px

## Components

- Buttons: minimum 44px height, subtle full border, clear focus ring
- Findings: bordered rows with severity, evidence, impact, and action
- Evidence: quiet tinted block with source label and quoted excerpt
- Status pills: semantic color plus text, never color alone
- Empty states: short instructions and one clear next action
- Loading: staged status text for parsing, analysis, and retrieval setup
- Workspace switcher: two explicit product modes, Contract Review and Verify Onboarding
- Verify queue: applicant, risk score, flag count, and suggested action at a glance
- Reconciliation matrix: submitted and extracted values shown without hiding missing fields
- Evidence panels: source, exact value, field, location, and extraction confidence
- Decision history: recommendation, human decision, rationale, reviewer, and timestamp
- Review policy: playbook, retention period, and source-text choice grouped before upload
- Review entry: one prominent `Review contract` action, with the sample agreement as a secondary path
- Playbook result: preferred position, fallback, escalation trigger, owner, matched finding, and evidence
- Saved review history: owner-scoped records labelled as saved rather than session-only

## Motion

Use only 150 to 220ms state transitions with ease-out-quart. Respect `prefers-reduced-motion`. Do not animate layout properties.
