# Source-retention follow-up — bounded candidate, 15 October 2026

The historical expiry regression identified by `MIGRATION-RESULT.md` now has a
locally tested implementation. **Not deployed or authorized for activation.**
The frozen migration result/manifest and original **34+5** logs remain historical
and unchanged; they do not automatically qualify this newer runtime source.

Final integration also incorporates the independent retention exception-boundary
P2 repair: check current claim first, then expiry/missing/unavailable source before
ordinary failure audits/notifications/email/webhooks. Current unusable sources
terminate without those effects; already terminal/reclaimed claims remain no-ops.
The four shared regressions run on both SQLite and local PG17.11. The companion
reviewed webhook-attempt and historical-default repairs are integrated alongside
it. **Combined66 offline +21 PG17.11 tests passed**; see `CODE-COMPLETE.md` for
current source hashes. The original retention31+12 logs below remain historical,
not final-byte acceptance. No raw secrets or account credentials entered logs.

## What the deadline does

`purge_expired_contracts` now delegates to source-only retention. It preserves
Contract, DocumentAsset/ContractVersion identities and metadata, structured review,
tasks/obligations/lifecycle, approvals, audit, graph/action/evidence/receipt/hosted
and budget records. It clears only `ContractReview.source_text` and each version's
`extracted_text`, and schedules deletion of **every** associated source object.
It never deletes the contract or a ledger record. Not-due/null-deadline sources
are unchanged. Structured findings/comparisons and historical audit/evidence may
contain derived quotations: this is not erasure of every copied character,
backups, provider object versions or independently retained context.

Unlike the old historical patch, expired `expires_at` is retained as an
irreversible access/write fence, not cleared. Retention-choice flags remain
metadata of the user's choices, not proof source is still available. Contract/
review/version dashboard metadata remains accessible. Human Q&A, DOCX source
export, agent source reads, version-source fallback and revised uploads deny
expired source; portfolio questions use structured review only after expiry,
even before maintenance. No retention renewal is silently granted.

## Durable deletion and concurrency

1. Lock expired contract rows (`FOR UPDATE SKIP LOCKED` on PostgreSQL; SQLite
   reserves its writer before reading). Clear extracted source and atomically set
   affected assets to **`purge_pending`**. Append one metadata-only
   `contract.source_purged` event under the contract lock. This event means source
   is logically inaccessible and deletion intent is durable, **not** proof every
   remote object has been erased.
2. Commit before object I/O. `purge_pending` denies reads and is the recoverable
   deletion queue using existing asset columns: **no schema migration or new head**.
   No scheduler, grants, idle loop or recurring paid call is introduced.
3. Snapshot pending asset IDs once, attempt each at most once per invocation. Hold
   a per-asset row lock through idempotent object DELETE and DB acknowledgement;
   concurrent PostgreSQL consumers skip claimed rows. SQLite serializes writers.
   On success mark **`purged`**. On failure/crash keep durable `purge_pending` and
   retry at the next separately scheduled/authorized document-maintenance request.
   This is not an in-process retry/poll loop. A failed object does not erase its
   intent or block cleanup of other assets.
4. Crash after remote delete/before acknowledgement may repeat DELETE. Local/S3
   adapters must treat absence as successful deletion. No exactly-once remote
   erasure, provider-version/lifecycle purge or full DR claim is made.

The deliberate tradeoff is a DB transaction/row lock over **one deletion**, not an
untracked in-memory claim or new lease schema. S3 now uses connect5s/read10s and
one total SDK attempt; durable intent owns retry. I/O timeouts are **not a hard
total DNS/elapsed deadline**. Root must review pool/lock cost, pending-age
monitoring and large-batch behavior against the exact image/PG18.6 clone. The
private agent HTTP worker never enters this document lane; request CPU/min0/max1/
concurrency1 and bounded on-demand drain remain unchanged.

## Related bounded regressions fixed

- Expired queued/running reviews are terminally fenced with
  `SourceRetentionExpired`; processing/import status becomes failed without
  deleting records or sending failure effects. A worker already analyzing cannot
  resurrect source or overwrite review after purge. Final commit locks the
  contract and refreshes/checks job status, original claim timestamp, deadline and
  asset state. SQLite claims/final writes serialize too. A reclaimed old worker
  cannot emit duplicate completion effects. Started provider work cannot be
  retroactively cancelled by these fences.
- No-retain object deletion now follows the successful review commit and uses
  the same durable intent. Failed deletion no longer destroys input before a
  failed DB save or flips successful review into failure.
- Lifecycle reminder rows lock before checking/updating reminder markers,
  preventing overlapping maintenance from queuing duplicate reminder effects.
- Failed email retries wait300s instead of exhausting retries in one drain;
  successful invitation emails clear token-bearing body/action URL, consistent
  with recovered production behavior. External messages cannot be recalled.
- Retention/review logs omit raw storage keys, source and provider exceptions;
  email failure records use a redacted code. No wholesale audit patch, connector/
  model, arbitrary workflow or unrelated auth refactor was imported.

## Focused evidence

```sh
.migration-local/venv/bin/python scripts/test-source-retention-local.py
.migration-local/venv/bin/python scripts/test-source-retention-local.py --postgres
```

- `.retention-local/offline-qualified.txt`: **31 passed**, no skips. Sixteen
  SQLite retention/behavior tests plus12 previous legacy compatibility tests
  and3 previous mocked Resend tests, run on the newer source.
- `.retention-local/postgres-qualified.txt`: **12 passed**, no skips. Nine common
  retention/claim cases plus three real concurrent-maintenance cases, using a new
  disposable PostgreSQL17.11 cluster, private Unix socket, synthetic full-schema
  data only. The launcher cleans its clusters/schemas on completion.
- `.retention-local/freeze.json`: current changed-path hashes, preserved prior
  freeze/log hashes and tests. `RETENTION-RESULT.md` is the root handoff.

Tests cover expired vs future/null deadlines, multiple assets plus unaffected
future contract in one batch, original-table/graph/action/ledger preservation,
metadata visibility and real HTTP source denial after purge, delete failure and
redacted logs, durable retry, crash after delete/before ack, late/reclaimed review
fencing, commit-before-delete, version-upload denial, portfolio source exclusion,
agent-only isolation and empty on-demand exit without sleep, email cleanup/backoff
and concurrent review/retention/reminder claims. Outbound providers are mocked;
no model/email/cloud/network effects occurred. S3 configuration is mocked, **not
live S3 acceptance**.

Runner reuses the existing private interpreter/dependencies, disables dotenv
before imports, uses initialization-only settings, blocks DNS/TCP and accepts no
external DB URL. No installation. CI discovers the new tests/opted-in PG class,
but no CI run is claimed. The older heavyweight `test_platform_api` expiry
expectation was corrected/compiled; that entire module was **not run** here.
Equivalent metadata/read denial is exercised by focused API tests without adding
packages.

## Remaining concrete release gates

Independent review of this delta and final main source/image; approved PG18.6
recovery-clone schema/data/runtime qualification; production-size locking/batch/
pending retry operational review; private worker/OIDC acceptance and separate
rollout/traffic/wake/recovery approval. Root's snapshot `br-cold-credit-b11o29gv`
remains PG18.6/schema6b1, **not migrated by this agent**. Root's16:37:29 UTC full
readback additionally matches all33 table values via salted server-side SHA-256,
columns/defaults, 223 indexes and470 constraints, superseding older PK-only
evidence. No production/Neon/cloud calls here. Keep queues/recovery paused,
hosted model false/0/no key, document job/schedules unexecuted until reviewed and
authorized; no paid/Calendar acceptance, signing/publication or fresh live SDK
denial is inferred.
