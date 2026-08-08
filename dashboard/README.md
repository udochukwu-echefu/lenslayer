# Lenslayer dashboard

The Next.js workspace for the Lenslayer platform. It provides workspace onboarding, authentication state handling, Today and Inbox queues, the contract register, upload and review context, evidence-linked contract detail, revised-document negotiation tracking, intake/integration administration, assigned actions, a due-date calendar, identity-evidence operations, operational reports, processing activity, retention choices, team access, and settings.

## Run locally

Start the platform API from the repository root:

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Start a worker in a second terminal:

```bash
python -m backend.app.worker
```

Then start the dashboard:

```bash
cd dashboard
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

`PLATFORM_API_URL` is server-only. Browser requests go through `/api/platform/*`, so the FastAPI location and local development identity headers are not included in client bundles.

Local identity variables are used only when `NODE_ENV` is not `production`. Production signs users in through the configured OpenID Connect provider, keeps the token in an encrypted server session, and forwards the bearer token to the API. Configure `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and the `AUTH_OIDC_*` values in `.env.example`; the provider callback is `/api/auth/callback/oidc`.

## Team roles

- **Owner** manages ownership, administrators, and all workspace actions.
- **Admin** manages reviewers and viewers, uploads reviews, and deletes contracts.
- **Reviewer** uploads contracts and inspects reviews.
- **Viewer** has read-only access.

Owners, administrators, and reviewers can also create, assign, update, and complete actions. Viewers can inspect the task register and calendar without mutation controls.

Invitation links expire after seven days, are bound to the invited email, and are displayed only at creation time. The API stores a SHA-256 hash rather than the invitation secret. Invitation, role, and removal events are included in the workspace audit history.

## Contract operations

- `/tasks` is the action register with active, assigned, completed, and all-work views.
- `/calendar` shows confirmed task due dates as a month grid on desktop and an agenda on smaller screens.
- Today surfaces actions assigned to the signed-in member and near-term dates.
- Inbox separates overdue work from actions due in the next seven days.
- Contract review findings, obligations, and deadlines offer an explicit “Create action” handoff. Nothing is created from model output without a person choosing to do so.
- Contract detail negotiation includes revised-document uploads, version history, before-and-after comparison, checklist outcomes, counterparty responses, unresolved points, and a final closeout summary.
- Contract detail includes a printable Deal Passport and tracked-change Word redline export for retained DOCX reviews.
- `/sample` is an unauthenticated fictional walkthrough; `/signin` presents the free public beta with no billing or upgrade flow.

## Verify workspace

- `/verify` is the organization-scoped persistent onboarding queue with risk, priority, assignee, recommendation, confidence, and decision status.
- `/verify/new` supports direct private document intake and expiring secure requests for email, Slack, Telegram, and WhatsApp delivery.
- `/verify/{caseId}` separates review, private document state, evidence reconciliation, assignment/workflow, human decisions, and compliance audit history.
- Owners, administrators, and reviewers can create and operate cases or load labelled demonstrations. Viewers are read-only.
- A reviewer can override the deterministic recommendation only with a written rationale. Each new decision is appended instead of replacing history.
- Pending verification decisions also appear in Inbox.
- Real uploads use private object storage, hashed integrity metadata, retention, and pre-storage malware scanning. Production requires ClamAV `clamd`; authenticity, liveness, and biometric matching still require production services.

## Reports workspace

- `/reports` provides 30-day, 90-day, 12-month, and all-time organization snapshots.
- Contract throughput, task execution, current attention items, Verify outcomes and recommendation overrides are reported separately.
- Reviewer workload shows current assigned and overdue actions alongside completions in the selected period.
- Recent activity is drawn from the append-only workspace audit history.
- Every role can read and export reports. CSV exports pass through the authenticated server proxy.
- Reports include retained records only. Deletion and expiry policies therefore apply to reporting as well as source data.

## Intake and integrations

- Settings includes a provider catalog and connection records for forwarding email, Google Drive, OneDrive, SharePoint, Dropbox, Slack, Telegram, WhatsApp, and the public API.
- The generated forwarding address and recent provider imports are visible to workspace administrators.
- `/intake/{token}` is an anonymous, constrained, expiring upload surface with no workspace access.
- Owners and administrators can create and revoke public API keys and webhook subscriptions.
- Recent imports and webhook delivery logs are visible from Settings.
- Provider credentials remain deployment secrets. Activating live OAuth, mailbox routing, Graph/Dropbox file fetches, or chat delivery does not require a database redesign.

## Quality gate

```bash
npm run lint
npm run build
npm audit --audit-level=moderate
```

## Cloudflare beta

The dashboard can deploy to Cloudflare Workers through OpenNext:

```bash
npm run cf:preview
npm run cf:deploy
```

See `../docs/deployment/cloudflare-beta.md` for the full beta stack, including Cloudflare R2, Neon Postgres, API hosting, worker hosting, and required secrets.

The design uses self-hosted Figtree, a restrained near-black/coral token system, WCAG-conscious states, keyboard focus styles, and responsive navigation. AI output is always framed as evidence to inspect rather than a final legal decision.
