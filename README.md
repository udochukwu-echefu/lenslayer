# LensLayer

LensLayer gives developer-run and LensLayer-hosted agents context, permission to act, and proof of completion. Agents retrieve retained evidence, propose typed workspace tasks or exact Calendar events, pause for factual input or human approval, and complete bounded workflows with independently verified receipts. It combines a Next.js operator workspace with a FastAPI service, persistent execution records, private document storage, and a separate worker.

The implementation is locally verified. Owners/admins can assign document follow-ups, Calendar events or combined goals through `/agent-tasks`; the Python hosted service persists planning checkpoints and uses existing approvals and verified receipts. A separate task-only TypeScript CLI remains a developer reference. Staging is prepared for review; live OIDC/provider/model checks, deployment and SDK publication remain release gates.

LensLayer is a separate project from ContractGuard, the original Streamlit contract-review application.

LensLayer turns agreements into source-linked risks, obligations, negotiation priorities, revised-document comparisons, decisions, approvals, tasks, lifecycle records, and counsel handoffs. It supports first-pass review and operational decision-making; it does not provide legal advice.

## Major Capabilities

- Scoped agent credentials and delegations, typed versioned tools, durable runs, source-version evidence receipts, immutable approvals, and verified internal tasks
- Exact owned-calendar targets, encrypted OAuth credentials, GET-only recovery of uncertain writes, and named task/event completion conditions
- Typed human/agent input waits, execution leases, durable metrics, and worker health checks
- Hosted assignment/status UI, database-backed planning recovery, and a dedicated agent worker lane
- Server-side TypeScript SDK, official local stdio MCP adapter, bounded task-planner CLI, and public developer onboarding
- PDF, DOCX, and TXT ingestion with extraction diagnostics and configurable retention
- Evidence-linked findings, grounded questions, playbook deviations, and professional-review handoff
- Revised-document uploads, deterministic before-and-after comparison, negotiation checklists, counterparty responses, and final summaries
- Comments, mentions, reviewer decisions, conditional approvals, assignments, tasks, deadlines, and notifications
- Post-signature renewals, notice periods, obligations, payments, recurring reminders, and calendar export
- Browser-local conversion of transaction-led financial PDFs into reviewed CSV, Excel, and API-ready JSON
- Forwarding-email and provider intake records for Google Drive, OneDrive, SharePoint, Dropbox, Slack, Telegram, and WhatsApp secure links
- Organization API keys, public contract endpoints, webhook subscriptions, and durable delivery records
- Private S3-compatible storage, PostgreSQL production mode, OIDC boundaries, role-based access, and audit events
- Responsive Cloudflare-ready dashboard and a separate public landing application

## Repository Layout

```text
backend/      FastAPI service, worker, models, and Alembic migrations
dashboard/    Next.js authenticated product workspace
landing/      Public Vite landing application
sdk/          Server-side TypeScript client and local package release checks
mcp/          Official SDK-based local stdio adapter
hosted-agent/ Bounded task-planner CLI and deterministic evaluations
examples/     External client and disposable HTTP/worker verification fixtures
branding/     Brand assets, tokens, previews, and reversible theme backups
docs/         Deployment and milestone documentation
tests/        Platform and deterministic analysis tests
```

Backend ownership is explicit:

- `backend/app/application.py`: side-effect-free application factory and lifecycle
- `backend/app/main.py`: default ASGI entrypoint
- `backend/app/api/`: HTTP routes grouped by product domain and shared request dependencies
- `backend/app/service_domains/`: authorization, business rules, and persistence
- `backend/app/document_intelligence/`: extraction, model analysis, prompts, playbooks, and evidence Q&A
- `backend/app/report_exports.py`: document and spreadsheet report generation
- `dashboard/src/lib/api/`: typed clients by domain, backed by one HTTP transport

See [repository maintenance](docs/architecture/repository-maintenance.md) for extension points and verification commands.

The [agent infrastructure direction](docs/architecture/agent-infrastructure-direction.md)
describes the developer-first roadmap. The [agent API contract](docs/architecture/agent-api-v1.md)
documents the implemented backend and its additive workflow routes. See the
[finish verification](docs/architecture/agent-pivot-finish-verification.md)
for actual checks and the [release checklist](docs/developer-release-checklist.md)
for the remaining external setup. The [developer quickstart](docs/developer-agent-quickstart.md)
covers API, SDK, MCP, planner, operator and Calendar consent setup.

## Local Development

Create a Python environment and install backend dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic -c backend/alembic.ini upgrade head
uvicorn backend.app.main:app --reload --port 8000
```

Run the worker in a second terminal:

```bash
source .venv/bin/activate
python -m backend.app.worker
```

For a dedicated hosted planning/action process, use
`python -m backend.app.worker --agents-only`. This lane runs independently of
document review and email work.

Run the dashboard in a third terminal:

```bash
cd dashboard
npm install
PLATFORM_API_URL=http://127.0.0.1:8000 npm run dev
```

The dashboard opens at `http://127.0.0.1:3000`.

## Verification

Run `make check` from the repository root after installing Python dependencies and
running `npm ci` in `dashboard`, `landing`, `sdk`, `mcp`, and `hosted-agent`.
The PostgreSQL tests require explicit disposable-database opt-in; skipped tests
are not PostgreSQL validation. See the operations guide and `make check-agent-postgres`.
Individual commands:

```bash
python -m unittest discover -s tests -v
python -m evaluation evaluation_fixtures
alembic -c backend/alembic.ini upgrade head

cd dashboard
npm run lint
npm test
npm run build

cd ../landing
npm run check
npm run build

cd ..
make check-agents
make check-agent-integration
```

## Deployment

The dashboard is prepared for Cloudflare Workers through OpenNext, and private document storage can use Cloudflare R2. The Python API and worker run as separate services behind TLS. See `docs/deployment/cloudflare-beta.md` and `backend/README.md` for environment and production-boundary details.

The [staging review](docs/deployment/agent-staging-review.md) specifies isolated
resources, pinned secret references, migration order and a disabled agent worker
pool. `make prepare-staging` renders the plan without deploying it.

Production requires PostgreSQL, OIDC verification, private object storage, malware scanning, secret rotation, backups, observability, and documented retention procedures.

## Architecture

The backend is composed from focused product-domain services, while document extraction, analysis, comparison, and evidence Q&A run through injectable ports and a side-effect-free review workflow. See [`docs/architecture/backend-domains.md`](docs/architecture/backend-domains.md).
