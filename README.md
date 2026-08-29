# LensLayer

LensLayer is an evidence-led document intelligence platform for contract review and operations. It combines a Next.js workspace with a FastAPI service, persistent workflow records, private document storage, and human-owned decisions.

LensLayer is a separate project from ContractGuard, the original Streamlit contract-review application.

LensLayer turns agreements into source-linked risks, obligations, negotiation priorities, revised-document comparisons, decisions, approvals, tasks, lifecycle records, and counsel handoffs. It supports first-pass review and operational decision-making; it does not provide legal advice.

## Major Capabilities

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
branding/     Brand assets, tokens, previews, and reversible theme backups
docs/         Deployment and milestone documentation
tests/        Platform and deterministic analysis tests
```

The backend also uses the root-level `analyzer.py`, `prompts.py`, `playbooks.py`, and `export_utils.py` modules.

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

Run the dashboard in a third terminal:

```bash
cd dashboard
npm install
PLATFORM_API_URL=http://127.0.0.1:8000 npm run dev
```

The dashboard opens at `http://127.0.0.1:3000`.

## Verification

```bash
python -m unittest discover -s tests -v
python -m evaluation evaluation_fixtures
alembic -c backend/alembic.ini upgrade head

cd dashboard
npm run lint
npm run build

cd ../landing
npm run build
```

## Deployment

The dashboard is prepared for Cloudflare Workers through OpenNext, and private document storage can use Cloudflare R2. The Python API and worker run as separate services behind TLS. See `docs/deployment/cloudflare-beta.md` and `backend/README.md` for environment and production-boundary details.

Production requires PostgreSQL, OIDC verification, private object storage, malware scanning, secret rotation, backups, observability, and documented retention procedures.
