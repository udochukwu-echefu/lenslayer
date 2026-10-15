# Production migration lineage — candidate for independent review

15 October 2026. **Local synthetic evidence only; no live database/cloud calls.**
This supersedes the *missing-source* blocker in the earlier `RESULT.md`, not its
release gates. Production is still API `lenslayer-api-00007-2jm`, PG18.6/schema
`6b1d3e8f2c57`; staging is PG17.11/schema `bf84e2c19a67`. No live migration ran.

## Source and supported DAG

Root recovered production migration from commit
`1afb7aea115d88e76684dfde749e55274596b9a2`, on branches not ancestral to current
source (merge base `3c6511ddb507ece3e6147a14fe6ee2e01239294e`). The two non-secret
test inputs are now portable under **`tests/fixtures/production-migration/`**:
original `6b1…` migration and read-only `production-schema-shape.json`, byte-for-
byte copies. Tests do not require the private/untracked `migration-history-source`
directory. `HISTORY.md` and `historical-backend-delta.patch` remain private review
evidence, not product/fixture commit inputs.
The recovered migration is installed **byte-for-byte**, including its original
parent. Existing 16 migration files are not reparented/rewritten.

```text
… → 4d2c8f1a9e77 ──→ 6b1d3e8f2c57 ──────────────────────────────────────┐
                └─→ 6e8a2b4d9c10 → 8f1… → 9a2… → ab3… → b14… → bf84… ├─→ c7a4e9d2b630
```

The new final revision merges both parents. Alembic runs **only missing branch
upgrades**, then collapses both version rows to one final head. It does not stamp,
replay already-applied production DDL, drop legacy columns, backfill secrets,
replace opt-outs or reset spent budgets. Final merge validates compatibility
column shapes and blocks downgrade **before** historical branch drops execute.
The final integrated validator also refuses missing/false/unrecognized historical
email defaults, recognizing only bounded literal-true semantics and supported PG
Boolean casts without evaluating SQL or repairing drift. The original6b1 bytes
are unchanged; only the not-yet-applied merge validation was hardened.
Original historical downgrade source is retained for byte identity, not approved
for production use. Use reviewed forward fixes, not a database downgrade.

| Starting state | Missing upgrades to final head |
| --- | --- |
| Actual production `6b1d3e8f2c57` | `6e8a2b4d9c10`, `8f1a3c5e7b90`, `9a2b4c6d8e10`, `ab3d5e7f9012`, `b14e6f8a9023`, `bf84e2c19a67`, `c7a4e9d2b630` |
| Applied staging `bf84e2c19a67` | original `6b1d3e8f2c57`, then `c7a4e9d2b630` |
| Fresh database | 18 distinct revisions including shared ancestors once, both branches, then the merge |

`scripts/check_production_migration_path.py` is a dependency-free, static DAG
preflight supporting merges, unknown/cyclic/missing-parent refusal, one expected
head and migration-file hashes. Its output is **not** schema/restore acceptance.

## Minimal runtime compatibility

- Map nullable `webhook_subscriptions.signing_secret` String(128), keeping existing
  values. No synthetic key backfill or hash-to-key reconstruction. API creates
  persist the returned key; list responses still omit it. Owner/admin rotation
  remains tenant-scoped; revoked subscriptions cannot rotate. Rotation deliberately
  **does not reset failed attempts or silently replay deliveries**, unlike the
  historical patch. That safety difference needs owner review.
- Map non-null `organization_memberships.email_notifications`, SQL/Python default
  true. Existing false stays false. Queue-time email suppression is scoped by
  organization/user; in-app notifications and invitations without user membership
  retain their historical behavior. Restore GET/PATCH `/preferences` under the
  current authenticated human dependency. This is **not** cancellation of emails
  already queued before an opt-out, nor a claim of race-free revocation at send.
- Restore bounded signed-webhook processing to the **document job only**; agents-
  only HTTP processing never claims email/webhooks. Wire format remains
  `X-LensLayer-Signature: t=<timestamp>,v1=HMAC_SHA256(key, timestamp + '.' + body)`
  with exact stored body and stable delivery ID. Missing keys fail closed; five
  attempts and 300s retry delay, active-subscription check, redacted error codes.
  Delivery is **at least once**, not an exactly-once external-effect protocol.
  Existing pending deliveries must be inspected before document-job activation.
- HTTPS transport checks all resolved addresses, pins the connection to a checked
  public IP while retaining the real hostname for TLS/SNI, disables redirects and
  avoids environment proxies. It preserves the historical signing contract without
  copying the historical DNS check/use race. Ten-second socket timeout is not a
  total DNS/elapsed deadline. Actual network/TLS/provider acceptance is untested.
- Historical raw signing-key storage is intentionally preserved, not silently
  replaced with a new encryption format. Protect DB backups/access and do not log
  ORM values. A future encryption migration requires its own reviewed plan.

**Not a wholesale historical merge.** Rate limits, extraction/evidence changes,
upload transaction changes and document retry were inspected but not broadly
imported. The frozen candidate's destructive-expiry regression now has a
[bounded follow-up](source-retention-review.md), with durable source-only deletion,
late-review/read fences and concurrent maintenance checks. That follow-up has
distinct **31 offline +12 PG17.11** results; original34+5 migration logs/manifest
below remain historical and unchanged. Independent review and exact-image PG18.6
clone/object-store/operational acceptance still gate release. Keep document job/
schedules unexecuted; local retention tests do not authorize effects or qualify
every remaining historical runtime/security difference.

## Actual local verification

**Final combined-source qualification supersedes source attribution, not history:**
`scripts/test-code-complete-local.py` passed **66 offline** tests, and its
`--postgres` mode passed **21 disposable PG17.11** tests after integrating reviewed
webhook-attempt/completion fencing, merge-default negatives and retention late-
failure fencing. Fixtures are now portable; no test requires private history
notes or the historical patch. `CODE-COMPLETE.md` records exact current bytes,
test inventory, handoff hashes and limits. No canonical CI or PG18.6 clone pass is
claimed here; root reports canonical CI now includes PG18.6/Node24.15/operator91.

Preserved final logs (do not attribute earlier failed setup attempts as passes):

- `.migration-local/offline-tests-reviewed.txt`: **34 passed**, no skips.
- `.migration-local/postgres-tests-reviewed.txt`: **5 passed**, no skips, real
  disposable PostgreSQL **17.11**, synthetic rows, private Unix socket, no TCP.
- `.migration-local/candidate-freeze.json`: exact changed-path/input/migration/log
  hashes and graph output. `MIGRATION-RESULT.md` explains the evidence boundary.

The four lineage cases run independently on SQLite and PostgreSQL: actual `6b1`
upgrade, applied `bf84` upgrade, fresh upgrade, and downgrade refusal. Tests build
the actual starting states by **running migrations, never stamping**. Recreated
`6b1` matches all **391 saved columns across 33 tables** (types/lengths/nullability,
plus PostgreSQL timestamp timezone); the supplied shape contains no complete
live index/constraint/default inventory, so this is not that comparison.

One synthetic row is seeded in **every starting application table** with FK edges;
hashes of every original column/row before and after upgrade must match (excluding
the intentionally changed Alembic version table). Production path preserves 32
application tables, literal false opt-out and synthetic signing key. Staging path
preserves graphs/checkpoints/receipts/Calendar rows and permanent reservations.
All paths converge to one head with full current ORM metadata comparison and
Alembic `check`. Fresh SQL inserts verify true preference default. Reapplying head
is a no-op. Downgrade attempts to both parents/base fail without data loss.

Runtime tests use real local DB/service/API routing with dependency-overridden
human users and mocked outbound transports. They cover preference scope/denial,
email suppression versus in-app notifications, key create/list/rotation, signing
bytes, delivery state/limits/revocation, agents-only isolation and bounded document
drain. Network calls, email sends and product-model initialization are forbidden.
Historical branch roundtrip/uniqueness tests now explicitly target `bf84` before
final merge, then check final metadata; they do not weaken the forward-only guard.

### Reproduce the focused runner

No product `.env`, credential store, account token or HOME override. Local tools:
CPython 3.14.4, initdb/pg_ctl/createdb PostgreSQL 17.11. The exact hashed
`tests/migration-local-macos-py314.lock` is a **macOS arm64 CPython3.14 test-wheel
lock**, not a replacement production dependency lock. Installation uses only
binary wheels (no source build hooks), private pip config/cache and `--no-deps`;
pip has no npm-style `--ignore-scripts` option. No npm install was needed.

```sh
python3 -m venv .migration-local/venv
env PIP_CONFIG_FILE=/dev/null .migration-local/venv/bin/python -m pip --isolated --cache-dir "$PWD/.migration-local/pip-cache" install --require-hashes --only-binary=:all: --no-deps --index-url https://pypi.org/simple -r tests/migration-local-macos-py314.lock
.migration-local/venv/bin/python scripts/test-migration-lineage-local.py
.migration-local/venv/bin/python scripts/test-migration-lineage-local.py --postgres
```

The runner disables dotenv before app imports, uses initialization-only settings
sources, forbids DNS/TCP sockets and supplies no product settings. `--postgres`
uses the existing local launcher to create/stop its **own** temporary cluster;
it accepts no external target. It cleans its cluster and schemas on completion.
Private pip resolution/cache/venv remain local scratch, not release inputs.

Current canonical CI is coordinator-reported upgraded to PG18.6 and Node24.15;
its `unittest discover` plus disposable-PG opt-in discovers the new PG classes
once tests and the two portable fixtures are integrated. It installs production
`requirements.txt`, **not** this macOS test-wheel lock or hardened local runner.
No CI edits/runs or current-source CI qualification occurred here. Actual local
tests used PG17.11 and must never be relabeled PG18.6 proof.

## Root-owned PG18.6 recovery-clone rehearsal — not executed

Root reports same-project recovery snapshot **`br-cold-credit-b11o29gv`**, PG18.6,
schema6b1, approved for one day. Root's **16:37:29 UTC** read-only comparison now
matches all33 table values via salted server-side SHA-256, columns/defaults,
223 indexes and470 constraints, with literal true email default on both sides.
This supersedes count/PK-only evidence: it **does** establish the reported full
value match, but not a migrated clone, candidate acceptance or newly authorized
cloud read. This agent did not access it. Review retention/expiry separately.

After independent candidate/plan approval, root must bind the **final reviewed
archive/image digest**, source freeze and clone identity. Use an isolated restored
PG18.6 DB with outbound network/provider execution blocked. Never execute app/
worker startup or repoint the production migration job. The following is the
clone-only Alembic command sequence for an approved container with `/app` as its
working directory. `CLONE_ONLY_ENV_FILE` is an existing protected operator file
with only `CLONE_DATABASE_URL` (direct SQLAlchemy URL) and
`CLONE_EXPECTED_DATABASE`. It is not committed, printed or opened by this agent.
`CLONE_NETWORK` must reach **only the isolated clone**, not production/Internet;
do not use host networking. These coordinates must be independently verified.

```sh
set -euo pipefail
: "${RUNTIME_IMAGE:?approved runtime image at sha256 digest required}"
: "${CLONE_ONLY_ENV_FILE:?existing protected clone-only config required}"
: "${CLONE_NETWORK:?isolated restore-only Docker network required}"
docker run --rm --interactive --network="$CLONE_NETWORK" --env-file="$CLONE_ONLY_ENV_FILE" --entrypoint=python "$RUNTIME_IMAGE" - <<'PY'
import os
import dotenv
dotenv.load_dotenv = lambda *args, **kwargs: False
from backend.app.config import Settings
Settings.settings_customise_sources = classmethod(lambda cls, settings_cls, init_settings, **kwargs: (init_settings,))
settings = Settings(_env_file=None, environment='migration', auto_create_schema=False,
                    database_url=os.environ['CLONE_DATABASE_URL'])
import backend.app.config as config_module
config_module.get_settings = lambda: settings
from sqlalchemy import create_engine, text
from alembic import command
from alembic.config import Config
engine = create_engine(settings.database_url, hide_parameters=True)
try:
    with engine.begin() as connection:
        assert connection.scalar(text('SELECT current_database()')) == os.environ['CLONE_EXPECTED_DATABASE'], 'Wrong clone database'
        assert connection.scalar(text('SHOW server_version')).startswith('18.6'), 'Wrong server version'
        assert list(connection.scalars(text('SELECT version_num FROM alembic_version'))) == ['6b1d3e8f2c57'], 'Wrong starting schema'
        config = Config('backend/alembic.ini')
        config.attributes['connection'] = connection
        command.current(config)
        command.upgrade(config, 'c7a4e9d2b630')
        command.check(config)
        assert list(connection.scalars(text('SELECT version_num FROM alembic_version'))) == ['c7a4e9d2b630']
    print('Clone schema upgrade/check completed; protected value comparisons and review still required')
finally:
    engine.dispose()
PY
```

Before and after, root must compare protected original-column full-row checksums,
33 original table counts/primary keys (except version row), constraints/indexes,
false preferences and signing-key continuity **without selecting secret values
into logs**. Test migrated model/service behavior using synthetic fixtures only;
never emit real email/webhooks/model/Calendar effects. Confirm original production
and staging remain unchanged, grants unaltered, queues/recovery paused and model
false/0/no key. Inspect lock duration/table sizes for ordinary index DDL. Neither
graph checks nor small synthetic rows qualify production load/lock behavior.

No root-clone command is permission to migrate production. Final source/CI/image,
independent runtime/retention follow-up review, recovery/restore evidence,
private min0/max1 worker acceptance and explicit activation remain separate gates.
