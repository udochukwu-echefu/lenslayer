# Agent foundation verification

Verified locally on 8 October 2026. This covers the implemented backend slice,
not a production deployment. The dashboard, SDK, and example were subsequently
checked in [handoff verification](agent-handoff-verification.md).

## Passed

- `.venv/bin/python -m unittest discover -s tests -v`: **83 tests passed**.
- Agent coverage within that suite: **26 tests passed**, including typed API
  boundaries, tenant/agent isolation, role checks, scoped tools/resources,
  source retention/provenance, approval binding/expiry, date arithmetic and UTC
  normalization, action/retrieval budgets, idempotency, cancellation, revocation,
  current delegation/approver authority, concurrent action proposals/claims,
  crash rollback/recovery, and stale/expired lease rejection.
- A real upload/extraction-to-agent-action round trip succeeds with a stub
  analysis provider. Task creation and verification use the actual database and
  worker, not mocked task receipts.
- `.venv/bin/python -m evaluation evaluation_fixtures`: existing grounding
  evaluation passed (one synthetic case).
- Alembic upgrade on a fresh disposable SQLite database passed.
- Migration regression test: upgrade, compare the new agent tables with model
  metadata, downgrade to the prior head, upgrade again, and verify existing
  organization data remains accessible. No new agent-table schema drift.
- `git diff --check`: passed.

## Observed limitations

Update from the isolated platform assignment: the historical index drift below
is repaired additively without removing uniqueness, including PostgreSQL's
secure-intake metadata discrepancy. See [platform result](agent-platform-result.md)
for the new actual local PostgreSQL/migration checks. The historical checks in
this document are unchanged; live provider/staging proof remains separate.

The full `alembic check` reports existing index differences in older tables:
missing requested/resolved-user indexes on approvals, a missing creator index
on lifecycle items, and differing uniqueness on token/key/organization indexes
for external shares, public API keys, and organization settings. These tables
were not changed by the agent migration. That separate maintenance issue remains
open; passing the new migration test does not imply the full historical schema
has no drift.

PostgreSQL lock behavior/load and live external-provider execution have not been
validated in this slice. The current executor creates internal database tasks.
Hosted model planning, external connector writes, and an MCP adapter remain
distinct milestones. The local SDK and operator UI are now implemented and
covered by the handoff verification. Keep the worker running for expiry and
lease recovery even when there is no queued document review.
