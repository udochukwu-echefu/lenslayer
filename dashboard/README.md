# LensLayer dashboard

The Next.js workspace for the LensLayer platform. It provides workspace onboarding, authentication state handling, Today and Inbox queues, the contract register, upload and review context, evidence-linked contract detail, revised-document negotiation tracking, intake/integration administration, assigned actions, a due-date calendar, operational reports, processing activity, retention choices, team access, and settings.

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

Local identity variables are used only when `NODE_ENV` is not `production`. Production signs users in through Auth0, keeps access and rotating refresh tokens in an encrypted server session, and forwards the bearer access token to the API. Configure `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_OIDC_ISSUER`, `AUTH_OIDC_AUDIENCE`, `AUTH_OIDC_CLIENT_ID`, and `AUTH_OIDC_CLIENT_SECRET`; the provider callback is `/api/auth/callback/oidc`.

`NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS=true` enables the synthetic public workspace for signed-out visitors while signed-in visitors continue to use Auth0-backed private workspaces. Set it to `false` only when every workspace route must require authentication. Authenticated deployments expose `/signin`, `/login`, `/signup`, invitation authentication, sign-out, auth-error, and session-expiry recovery pages.

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
- `/sample` is an unauthenticated fictional walkthrough. `/signin` and `/signup` start the Auth0 Universal Login flow for private workspaces.

## External agents and verified runs

- `/agents` lets workspace owners/admins list, create, and revoke scoped external-agent credentials. The credential is displayed once with an explicit copy control and cleared on dismissal, navigation, tab hiding, or workspace/role changes. Secret responses never enter query/mutation caches or browser storage.
- `/runs` and `/runs/[runId]` show bounded scope, named task/event success conditions, immutable proposals, factual input history, attempts, evidence, ordered events, partial effects and verified results. Query keys include the workspace ID.
- Human responders supply typed requested facts in Runs; agent responders use scoped bearer routes. Facts cannot change delegated scope or the original action/condition.
- Owners/admins connect one owned calendar in Settings and complete consent at `/calendar/oauth-return` as the initiating human. Register exactly the dashboard origin plus that path, configure backend provider/encryption secrets, and suppress callback query access logs. The UI clears query parameters and never persists provider code/state/tokens.
- Only owners/admins can approve/reject an unexpired pending invocation or cancel an unfinished run. Approval binds the exact immutable input hash; no fields can be edited in place.
- Cancellation and revocation prevent new dispatch; completed effects remain. An uncertain Calendar write offers bounded GET-only reconciliation to owners/admins. Task receipts and event GET receipts verify a snapshot; every named condition needs its own receipt for composite success.
- `/agent-tasks` lets signed-in private-workspace owners/admins assign bounded document follow-up, Calendar or combined goals and inspect recent statuses. `/agent-tasks/[taskId]` tracks durable phases and links to Runs for approval/input/receipts. It uses authenticated human `/hosted-agent-tasks` and `/hosted-agent-capabilities` endpoints, not a browser agent credential. Default planning is an honestly labeled fixed workflow; model-assisted planning is server capability-gated and explicitly discloses goal/facts/excerpt sharing.
- Exact contracts/members/original encrypted Calendar grants are chosen through existing private APIs. Times require Z or an explicit offset; no identities/timezones/calendar IDs are inferred. Task title/description and scope are human-authored fixed facts. The submit key/input remain frozen after ambiguous failure, with no automatic retry. Identity/workspace/role switches abort/drop late requests; leaving can still race server acceptance. Inspect history before reassigning.
- Hosted run ownership is labeled `lenslayer_hosted_agent`, separate from external agents and separate from the planning method. Every hosted action requires human approval. Queued/planning/approval/input states are not verified completion; combined goals need every named receipt.
- The synthetic public workspace explicitly labels illustrative records and never executes or offers mutation controls. Agent tasks shows no fake hosted assignment history; it links to the clearly synthetic run example.
- See [the developer quickstart](../docs/developer-agent-quickstart.md), [server-side SDK](../sdk/README.md), and [implemented backend contract](../docs/architecture/agent-api-v1.md).

Local API identity headers do not establish an authenticated browser session. Use
the existing OIDC workspace login for private dashboard access, or the quickstart's
human API commands for an API-only local check. Do not mistake public demo records
for executions in a local/private database.

## Reports workspace

- `/reports` provides 30-day, 90-day, 12-month, and all-time organization snapshots.
- Contract throughput, task execution, current attention items, and human contract decisions are reported separately.
- Reviewer workload shows current assigned and overdue actions alongside completions in the selected period.
- Recent activity is drawn from the append-only workspace audit history.
- Every role can read and export reports. CSV exports pass through the authenticated server proxy.
- Reports include retained records only. Deletion and expiry policies therefore apply to reporting as well as source data.

## Intake and integrations

- Settings includes a provider catalog and connection records for forwarding email, Google Drive, OneDrive, SharePoint, Dropbox, Slack, Telegram, WhatsApp, and the public API.
- The generated forwarding address and recent provider imports are visible to workspace administrators.
- Owners and administrators can create and revoke public API keys and webhook subscriptions.
- Recent imports and webhook delivery logs are visible from Settings.
- Provider credentials remain deployment secrets. Activating live OAuth, mailbox routing, Graph/Dropbox file fetches, or chat delivery does not require a database redesign.

## Quality gate

```bash
npm run lint
npm test
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

Automatic invocation URL logs are disabled in `wrangler.jsonc` through
`observability.logs.invocation_logs=false` so OAuth callback code/state query
strings are not captured by that default log channel. Custom logs remain enabled
and must stay metadata-only. The staging config, reverse-proxy/access logs,
Cloudflare Logpush/Tail/traces and other analytics need the same independent
redaction/disable review before consent; browser query clearing alone is not enough.
No logging or deployment change was applied to a live account.

Optional local Chrome visual smoke (after the default build):

```bash
node scripts/verify-hosted-ui.mjs /absolute/path/to/chrome
```

On macOS the Chrome application binary is the default. The script starts only its
own loopback production server, uses a new disposable browser profile, intercepts
all human/task APIs with explicitly synthetic fixtures, blocks external page
requests and makes no assignment writes. It verifies 320/375/768/1440px light/dark
form layouts, 320/1440px detail, run links and capability-enabled model disclosure.
Screenshots/results go to ignored `.hosted-ui-qa/`; the profile and owned processes
are cleaned up. This is visual smoke, not OIDC/provider/backend integration.

## Code boundaries

`src/lib/api.ts` is the stable public facade. Endpoint definitions live in
`src/lib/api/<domain>.ts`; `client.ts` owns authentication, JSON serialization,
error handling, and downloads. JSON mutations use `jsonRequest`; multipart
uploads use `request` so the browser sets the boundary. Demo fixtures load
only when demo access is enabled, and `workspace-mode.ts` holds lightweight
workspace identifiers.

The AI assistant displays complete responses as soon as the API returns.
Pending indicators reflect the actual request; there is no artificial typing delay.
