# Backend domain architecture

LensLayer keeps `PlatformService` as a compatibility facade for FastAPI and existing integrations, but implementation ownership now lives in focused modules under `backend/app/service_domains/`.

| Module | Responsibility |
| --- | --- |
| `workspace` | users, organizations, membership, roles, and invitations |
| `tasks` | assigned actions and task policy |
| `contracts` | contract intake, review records, jobs, retention, and deletion |
| `integrations` | provider connections, imports, API keys, and webhooks |
| `negotiation` | versions, comparisons, checklist state, responses, and closeout |
| `review` | evidence Q&A, exports, redlines, and counsel handoff |
| `collaboration` | comments, human decisions, and approvals |
| `sharing` | expiring external review access |
| `lifecycle` | obligations, recurrence, reminders, and calendar export |
| `governance` | activity, notifications, portfolio search, audit, and reports |

`api/` contains a router for each HTTP domain. `main.py` configures the application, middleware, lifespan, and router registration. Shared dependencies in `api/dependencies.py` resolve the request-scoped session, service, and current user once per request. Domain modules import their models and schemas directly; `service_domains/common.py` contains only shared helpers and policies.

`ServiceBase` owns only the shared session, settings, object store, review-workflow dependency, notifications, and audit writes. Cross-domain collaboration is declared by the small protocols in `service_domains/interfaces.py`; production defaults bind them to the compatibility facade, while focused tests can substitute only the collaborator a domain needs.

## Document intelligence

`backend/app/document_intelligence/` owns the pure review workflow and its ports:

- document extraction
- contract analysis
- deterministic version comparison
- retained-text contract Q&A
- portfolio evidence Q&A
- playbook evaluation

Adapters translate `extraction.py`, `analysis.py`, and `playbooks.py` into those ports. The active model prompt lives in `document_intelligence/prompts.py`; exported review files are generated in `report_exports.py`. The worker retains persistence, retention, notifications, audit, and failure transitions; the review workflow remains synchronous and side-effect-free. FastAPI and the worker accept workflow factories at their composition roots, allowing tests and future deployments to substitute adapters without patching provider libraries.

Historical route paths, response schemas, database models, transaction ordering, and retention behavior remain unchanged by this refactor.
