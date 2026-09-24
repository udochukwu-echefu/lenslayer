# Repository maintenance

## Ownership

| Location | Responsibility |
| --- | --- |
| `backend/app/main.py` | Compose the API and manage runtime resources |
| `backend/app/api/` | Parse HTTP inputs, call services, serialize responses |
| `backend/app/api/dependencies.py` | Request-scoped session, service, and authenticated user |
| `backend/app/service_domains/` | Domain authorization, business rules, transactions |
| `backend/app/service_domains/common.py` | Small shared serialization and policy helpers |
| `backend/app/document_intelligence/` | Document extraction, model analysis, prompts, playbooks, evidence search |
| `backend/app/report_exports.py` | PDF, DOCX, Markdown, JSON, and CSV generation |
| `backend/app/worker.py` | Durable background jobs, reminders, delivery, and retention |
| `backend/migrations/` | Versioned database migrations; do not rewrite historical migrations |
| `dashboard/src/lib/api/` | Typed endpoint clients and shared HTTP transport |
| `dashboard/src/lib/api.ts` | Stable facade used by components |
| `dashboard/src/lib/workspace-mode.ts` | Lightweight demo/private workspace identifiers |
| `dashboard/src/components/` | Shared product UI |
| `landing/` | Independent public marketing application |
| `tests/` | API, policy, security, worker, extraction, and query-count regressions |
| `docs/` | Architecture and deployment guidance |
| `branding/` | Source brand assets and intentional design history |
| `output/` | Local generated artifacts, ignored by Git |

## Adding behavior

1. Implement domain rules in the appropriate service. Import dependencies directly
   from their owning modules; do not reexport unrelated models through the service base.
2. Add the route to its domain router. Use `UserDep` for authenticated identity and
   `ServiceDep` for the shared request-scoped service. Keep public-link and API-key
   authentication separate from workspace login.
3. Add its typed client to the matching dashboard API module and include that module
   in the facade if it is a new domain. JSON bodies use `jsonRequest`; uploads keep
   `FormData` and let the browser provide content-type boundaries.
4. Test observable behavior, authorization, failure modes, and query counts when
   adding list serializers. Avoid one lazy relationship query per response row.

## Verification

Install the root Python requirements into `.venv`, then install dashboard and landing
packages using their lockfiles. Run `make check`. Override `PYTHON` if using another
virtual environment. Run `make benchmark` for reproducible local list-endpoint timings
and SELECT counts against synthetic SQLite data. Timings are local measurements,
not production guarantees.

Schema changes additionally require testing migrations against a disposable database:

```sh
LENSLAYER_PLATFORM_DATABASE_URL=sqlite:////tmp/lenslayer-migration-check.db \
  .venv/bin/python -m alembic -c backend/alembic.ini upgrade head
```

## Cleanup scope

The old root-level embedding/vector-store Q&A chain, comparison prompt, duplicate
filename helper, and legacy playbook-store initializer had no callers. The active
workflow already uses retained-text evidence retrieval and deterministic version
comparison. Those unused paths and their four direct embedding/vector dependencies
were removed. Live extraction, evidence Q&A, model analysis, report export, public
routes, database schema, and deployment entry points remain supported.
