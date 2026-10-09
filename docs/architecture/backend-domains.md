# Backend domain architecture

LensLayer keeps `PlatformService` as a compatibility facade for FastAPI and existing integrations, but implementation ownership now lives in focused modules under `backend/app/service_domains/`.

| Module | Responsibility |
| --- | --- |
| `agents` | agent delegations, bounded runs, evidence receipts, action approvals, and execution records |
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

## Agent infrastructure

`agent_models.py` and `agent_schemas.py` define the new control-plane records and
strict API contract. `api/agents.py` separates human administration from agent
bearer authentication. `service_domains/agents.py` owns scoped delegation, source
receipts, run state/events, immutable action creation, and human approvals.

`agent_runtime.py` implements the first durable internal action. Its action rows
are the transactional dispatch outbox. `worker.py` claims and executes actions,
recovers expired leases, and closes expired runs. Task creation and independent
read-back verification commit with the action/run result. The document review
workflow remains separate from agent planning and execution.

See [agent API v1](agent-api-v1.md) for the shipped contract and its limits.
