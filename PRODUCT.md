# Product

## Register

product

## Users

Legal, procurement, finance and operations teams that review agreements together and need to keep track of what they have agreed to: risks, obligations, renewal and notice dates, and who owns the next step.

## Product Purpose

LensLayer is contract review and renewal follow-through for teams. It gives each uploaded agreement a first-pass review of risks, obligations, payments and key dates, each linked to the clause it came from, and answers questions across agreements with source-linked citations. Teams record review decisions in a shared Overview queue, and renewal, notice and termination dates get an owner, a reminder and escalation when they slip. The review is first-pass triage and a hand-off to professional review, not legal advice, and it says what it could not read or confirm. Agents, runs and the document converter remain in the codebase behind build-time flags, but public messaging covers contract review and renewals only.

## Brand Personality

Calm, rigorous, direct. The interface should feel like a focused review desk: high signal, legible, and careful about uncertainty.

## Anti-references

- Generic AI chat wrappers that hide their evidence
- Alarmist legal scoring that presents model output as certainty
- Decorative legal-tech dashboards with oversized metrics and little actionability
- Dense case-management software designed only for trained lawyers

## Design Principles

1. Evidence before assertion: material conclusions and proposed actions should point back to a retained source and version.
2. Action after explanation: show the exact target, supplied facts, permissions and intended outcome before asking for approval.
3. Honest uncertainty: say what was not found, what could not be parsed, and what needs human review.
4. Privacy in context: explain document handling at the point of upload and provide deletion controls.
5. Progressive depth: make the first screen scannable, then let users inspect clauses and supporting detail.
6. Human decision ownership: automation may recommend, but consequential approvals and rejections must remain inspectable and attributable.
7. Confidence is not risk: extraction reliability, evidence coverage, and review status must be displayed as separate signals.
8. Minimise retained data: persist the useful report by default, retain source text only with explicit user choice, and make retention and hard deletion visible.
9. Completion needs a receipt: distinguish a verified task or event being created from the business work subsequently being performed.
10. Waiting should be quiet: human approval and future timers preserve progress without an idle worker loop.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Preserve keyboard access, visible focus, 44px touch targets, non-color state labels, reduced-motion support, and plain-language explanations.
