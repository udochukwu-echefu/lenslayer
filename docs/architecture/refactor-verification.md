# Refactor and latency verification — 22 September 2026

## Measured database work

Synthetic local SQLite dataset: 20 distinct contracts, tasks, and lifecycle items; 21 members. Each endpoint has its own request-scoped session. Timings are medians of seven warm requests, including API serialization. No artificial database delay was injected.

| Endpoint | SELECTs before | SELECTs after | Local median before | Local median after |
| --- | ---: | ---: | ---: | ---: |
| contracts | 23 | 4 | 4.03 ms | 2.38 ms |
| tasks | 43 | 3 | 6.83 ms | 2.08 ms |
| lifecycle | 43 | 3 | 6.52 ms | 2.27 ms |
| members | 23 | 3 | 3.98 ms | 1.73 ms |
| reports | 50 | 10 | Not benchmarked | Not benchmarked |

Production latency was not benchmarked. Network distance, database size, concurrency, model response time, and infrastructure will affect real-world results. Query-count regressions are tested because they are more stable than wall-clock timing assertions.

## Changes

- Split application composition from 12 domain routers; preserved the complete OpenAPI schema across 62 paths.
- Resolve authenticated users through a shared request dependency instead of repeating identity setup in handlers.
- Import model and schema dependencies directly in service domains; keep the base class focused on runtime resources, audit, and notifications.
- Move active extraction, model analysis, prompts, and playbooks into the document-intelligence package; move exports into the backend package.
- Remove unused vector Q&A, embedding setup, comparison and rewrite prompts, duplicate filename code, and the old playbook-store initializer. Remove four unused direct vector/embedding dependencies.
- Organize 73 typed dashboard API methods into eight domain modules behind the existing facade; centralize JSON requests and keep multipart uploads separate.
- Load synthetic demo data on demand.
- Display AI answers immediately on response completion instead of waiting up to roughly 2.2 seconds for simulated typing.
- Eager-load the relationships required by list serializers and reports. Keep workspace and role checks unchanged.
- Remove five unreferenced Next.js starter SVGs. Ignore generated output without deleting local artifacts.
- Add `make check`, `make benchmark`, maintenance guidance, and regression tests.

## Validation

- 54 backend tests pass, including five query-count regression tests that reproduced excessive round trips before optimization.
- 49 dashboard tests pass, including transport behavior and immediate AI-answer display.
- `make check` passes in the original repository: backend tests, offline evaluation, dashboard tests and lint, dashboard production build with Turbopack, landing lint, and landing production build.
- Dashboard TypeScript checking passes as part of the production build.
- Database migrations run successfully against an empty disposable SQLite database.
- Offline evaluation passes.
- The existing API schema was compared in full before and after the refactor, including after application to the original repository, and is identical.

## Boundaries

No production deployment, live customer data migration, or real model/network latency claim is included. Historical migrations, authentication policy, retention policy, and database schema are unchanged. The repository entry points `backend.app.main:app`, `backend.app.worker`, and `python -m evaluation` are retained.
