# Batch 1: bounded upload execution

Local implementation on `perf/upload-concurrency`, based on `18f851679`.
Scope: upload concurrency only; no frontend, schema, worker, infrastructure or
deployment changes. The original performance recommendations and review were
read from the owner's original checkout, not copied into this worktree.

## Execution boundary

- Workspace creation, email intake, Google Drive/provider imports, public API
  creation and negotiation version uploads share `backend/app/api/uploads.py`.
- Async file reading retains the existing size limit. Admission happens before
  session creation. Identity verification/user lookup, service construction,
  scanning, storage, database work and response-model construction all run in one
  worker-owned session. No ORM objects return to the async request.
- `LENSLAYER_PLATFORM_UPLOAD_CONCURRENCY` defaults to **4** per API app/process
  (validated range 1–32). All six routes share it; ordinary FastAPI sync reads
  keep their separate thread capacity. This is not a global cluster quota or a
  bound on already-read multipart bodies waiting for admission.
- Waiting requests can cancel without creating a session. Once a worker starts,
  it owns its slot until cleanup/session close. AnyIO cancellation is shielded;
  direct asyncio task cancellation also cannot release a running worker's slot.
  A cancelled running write may still commit, as synchronous work cannot be
  killed safely. Committed jobs retain the existing dispatch/recovery behavior.
- Existing role/tenant/API-key checks, fail-closed scanning, retention, storage
  cleanup and post-success review dispatch remain in their domain services.
  Existing import transaction boundaries are unchanged.

## Local evidence

`tests/test_upload_concurrency.py`: **10 passing tests**. Events hold fake scanner
and storage adapters until an authenticated, tenant-scoped contract read finishes
on the same event loop, for every upload route. These are overlap assertions, not
latency estimates. A five-request test with capacity two observes two owned
sessions and three queued requests; thread ownership is asserted through SQL,
flush, commit, rollback and close. Further tests cover slow identity lookup,
public key scope/revocation, cancellation while queued/running/before startup,
malware rejection, scanner unavailability, partial storage writes, commit failure,
cleanup, size/auth/retention and dispatch. All data is synthetic/disposable.

Executed from this worktree with
`/Users/udo/Desktop/iCloud Drive Local/Desktop/projects/lenslayer/.venv/bin/python`:

| Command suffix | Result |
| --- | --- |
| `-m unittest discover -s tests -p test_upload_concurrency.py -v` | 10 passed |
| `-m unittest discover -s tests -p test_platform_api.py` | 26 passed |
| `-m unittest discover -s tests -p test_source_retention.py -v` | 20 passed, 16 PostgreSQL tests skipped |
| `-m unittest discover -s tests -p test_security.py -v` | 4 passed |
| `-m unittest discover -s tests -p test_production_integrations.py -v` | 7 passed |
| `-m unittest discover -s tests -p test_review_trigger.py -v` | 2 passed |
| `-m unittest discover -s tests -p test_legacy_compatibility.py -v` | 19 passed |

Reviewed route arguments/response construction and session/slot ownership,
including raw task-cancellation and admission/startup races. No production/paid
calls, external scans, deployment, push or merge. Real PostgreSQL/S3/scanner
latency and production concurrency tuning remain unmeasured.

References: [FastAPI utility calls](https://fastapi.tiangolo.com/async/#other-utility-functions),
[AnyIO worker threads](https://anyio.readthedocs.io/en/stable/threads.html),
[SQLAlchemy session concurrency](https://docs.sqlalchemy.org/en/20/orm/session_basics.html#is-the-session-thread-safe-is-asyncsession-safe-to-share-in-concurrent-tasks).
