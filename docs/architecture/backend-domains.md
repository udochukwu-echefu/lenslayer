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

`ServiceBase` owns only the shared session, settings, object store, review-workflow dependency, notifications, and audit writes. Cross-domain collaboration is declared by the small protocols in `service_domains/interfaces.py`; production defaults bind them to the compatibility facade, while focused tests can substitute only the collaborator a domain needs.

## Document intelligence

`backend/app/document_intelligence/` owns the pure review workflow and its ports:

- document extraction
- contract analysis
- deterministic version comparison
- retained-text contract Q&A
- portfolio evidence Q&A
- playbook evaluation

Adapters translate the existing PDF, DOCX, OCR, model, and playbook implementations into those ports. The worker retains persistence, retention, notifications, audit, and failure transitions; the review workflow remains synchronous and side-effect-free. FastAPI and the worker accept workflow factories at their composition roots, allowing tests and future deployments to substitute adapters without patching provider libraries.

Historical route paths, response schemas, database models, transaction ordering, and retention behavior remain unchanged by this refactor.
