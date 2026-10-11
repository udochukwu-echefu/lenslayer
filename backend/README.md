# LensLayer Platform API

This backend powers the standalone LensLayer platform and its Next.js workspace.

## Included foundation

- Separate agent bearer credentials, owner/admin delegations, resource/tool/assignee scopes, expiry, and revocation
- Durable external-agent runs, ordered events, retained-source evidence receipts, and immutable approval-bound actions
- Transactional task dispatch with lease fencing, bounded recovery, cancellation, and verified database read-back outcomes
- Typed/versioned tools, explicit contract/calendar grants, composite checkpoints, and immutable structured input waits
- Encrypted tenant Calendar OAuth, stable event IDs, bounded dispatch, exact provider read-back and partial-effect/unknown-outcome records
- Human-assigned hosted goals, durable planning checkpoints, internal scoped delegation and an independent agent worker lane
- FastAPI application with local and OIDC authentication boundaries
- Organisation and membership isolation
- Owner, administrator, reviewer, and read-only viewer roles
- Email-bound, seven-day team invitations with hashed one-time tokens
- Audited invitation, role-change, and membership-removal events
- Organisation-scoped workflow tasks with contract links, assignees, priorities, due dates, completion timestamps, and source references
- Audited task creation, status changes, reassignment, and deletion
- Read-only organization reports for contract throughput, task execution, human outcomes, workload, activity, and CSV export
- Contract, document asset, processing job, review, and audit-event records
- Local development storage and S3-compatible production storage
- Database-backed review queue and standalone worker
- PostgreSQL-ready SQLAlchemy models and Alembic migrations
- Upload validation, configurable retention, source-text opt-in, and hard deletion
- Editable workspace review defaults
- In-product review-ready and review-failed notifications
- Retained-text contract Q&A with inspectable evidence
- PDF, DOCX, CSV, Markdown, and JSON contract-review exports
- Revised-document version history with deterministic before-and-after comparison
- Negotiation checklist items, counterparty responses, accepted/rejected outcomes, unresolved points, and final summaries
- Tracked-change Word redlines with review comments for retained DOCX versions
- Deal Passport readiness records assembled from findings, versions, negotiation outcomes, approvals, actions, and dates
- Shared intake records for forwarded email, Google Drive, OneDrive, SharePoint, Dropbox, Slack, Telegram, WhatsApp secure links, and public API uploads
- Organization API keys, public upload/read endpoints, webhook subscriptions, and webhook delivery logs
- Liveness and readiness endpoints

## Run locally

Install the repository requirements, then copy `.env.example` to `.env` and set `GROQ_API_KEY` before processing a review.

```bash
alembic -c backend/alembic.ini upgrade head
uvicorn backend.app.main:app --reload --port 8000
```

In a second terminal, run the worker:

```bash
python -m backend.app.worker
```

Local authentication is intentionally explicit. Requests default to `local-user`; tests and development tools can set these headers:

```text
X-LensLayer-User: stable-user-id
X-LensLayer-Email: person@example.com
X-LensLayer-Name: Person Name
```

Local mode must never be exposed as a shared production API. Setting `LENSLAYER_PLATFORM_ENVIRONMENT=production` is rejected unless OIDC, PostgreSQL, private S3-compatible storage, Cloudmersive scanning, Resend email, and Alembic-managed schema settings are configured.

## API workflow

1. `POST /api/v1/organizations`
2. `POST /api/v1/organizations/{organization_id}/contracts` as multipart form data
3. Poll `GET /api/v1/organizations/{organization_id}/contracts/{contract_id}/jobs`
4. Open `GET /api/v1/organizations/{organization_id}/contracts/{contract_id}/review`
5. Ask retained source text through `POST /questions` or download a review through `GET /exports/{pdf|docx|csv|md|json}`

Team access uses `/api/v1/organizations/{organization_id}/members` and `/invitations`. The public invitation preview does not expose the full email; acceptance requires an authenticated identity whose email exactly matches the invitation.

Contract operations use `/api/v1/organizations/{organization_id}/tasks`. The list endpoint supports status, assignee, contract, and due-date filters. Owners, administrators, and reviewers can create and update actions; viewers are read-only. Owners and administrators can delete any task, while reviewers can delete only tasks they created.

Reporting uses `/api/v1/organizations/{organization_id}/reports/overview` and `/reports/export`. The endpoints accept `range=30d`, `90d`, `365d`, or `all`, require organization membership, and derive results from retained source records without creating a second analytics data store.

Negotiation closeout uses `/contracts/{contract_id}/versions`, `/negotiation-items`, `/counterparty-responses`, and `/negotiation-summary`. Owners, administrators, and reviewers can upload revised documents and record negotiation outcomes; viewers can read the version history, checklist state, responses, and final summary.

Intake and integrations use `/integrations/providers`, `/integrations`, `/integrations/{provider}/imports`, `/intake/email-address`, `/intake/email`, `/api-keys`, `/webhooks`, `/webhook-deliveries`, and `/public/contracts`. The platform stores connection metadata and import provenance, routes every supported document through the same review pipeline, rejects connector secrets in database settings, and records downstream delivery state. Live OAuth, mailbox routing, Graph, Dropbox, and messaging credentials are deployment secrets and are intentionally not committed.

Interactive OpenAPI documentation is available at `http://localhost:8000/docs` outside production.

## Agent execution

Human owners/admins create a scoped agent through
`POST /api/v1/organizations/{organization_id}/agents`. The returned agent credential
is shown once and must be kept server-side. Developers use it at `/api/v1/agent/*`
to create a bounded run, retrieve evidence from a retained contract version, and
propose `workspace.tasks.create`. Human approval is required by default.

The worker rechecks delegation, source, approval, expiry, and lease ownership;
it creates the task, reads it back, and persists the verified run result in one
transaction. It also expires abandoned runs and approval windows. Run it
continuously for recovery; `--once` and `--drain` also process agent actions.

This supplies infrastructure for externally planned agents, internal workspace
tasks and a bounded Google Calendar connector implementation. Independent
calendar goals need no contract; document-backed reminders can cite retained
evidence. Human owners/admins also assign hosted goals through
`/api/v1/organizations/{organization_id}/hosted-agent-tasks`. The Python hosted
planner persists checkpoints for document follow-ups, Calendar-only events and
combined goals. It requires human action approval and matching verified receipts;
it never issues a usable agent bearer to the browser. Use
`python -m backend.app.worker --agents-only` for its continuous planning/action
lane without document/email processing. Calendar uses fake-HTTP tests; real
consent/provider and staging verification remain pending.
See [the API contract](../docs/architecture/agent-api-v1.md) for schemas, endpoints,
idempotency, limits, failure states, and verification details.
See [additive interface changes](../docs/architecture/agent-interface-changes.md)
for workflows, composite conditions, tool actions, input requests, OAuth,
reconciliation and metrics. Original v1 routes/hashes remain compatible.
[Worker operations](../docs/deployment/agent-worker-operations.md) covers continuous
execution, migration/health, explicit sandbox OAuth, disposable PostgreSQL tests
and pending staging acceptance.
See [hosted API](../docs/architecture/hosted-agent-api.md),
[hosted operations](../docs/deployment/hosted-agent-service.md) and
[staging review](../docs/deployment/agent-staging-review.md) for the assignment
contract, optional decision-only model and deployment preparation.

## Production boundaries

- Use PostgreSQL and run Alembic migrations with automatic schema creation disabled.
- Use an encrypted S3-compatible bucket such as Cloudflare R2 with private access only.
- Configure OIDC issuer, audience, and JWKS verification.
- Run API and worker as separate services.
- Put the API behind TLS and a trusted reverse proxy.
- Configure database backups, secrets rotation, malware scanning, observability, and incident procedures before accepting confidential documents.
