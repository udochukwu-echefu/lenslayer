# Production release preflight — frozen bytes, parked dispatch, recovery

Prepared 15 October 2026. **Root/operator commands for separate review/approval;
this review ran no cloud commands.** Do not batch-run a rendered plan. Gate labels
are not technical authorization enforcement. Do not use the legacy
`deploy/gcp/cloudbuild.yaml`: it requires active dispatch/recovery and couples
build, migration and promotion. Use the build-only `cloudbuild.release.yaml`.

## 0. Evidence and hard stops

- Production is unchanged: API `lenslayer-api-00007-2jm`, schema `6b1d3e8f2c57`.
  Root reconfirmed PostgreSQL **18.6**; staging schema `bf84e2c19a67` used
  PostgreSQL **17.11**, not production-version migration/restore evidence.
- The missing historical source was subsequently recovered: original `6b1…`
  extends `4d2…`, alongside agent foundation `6e8…`; staging ends at `bf84…`.
  The candidate restores the original migration byte-for-byte and merges both
  unchanged branches at **`c7a4e9d2b630`**. Local synthetic checks pass, but **STOP
  before live migration** pending root review and the exact-source/image PG18.6
  recovery-clone rehearsal. Never stamp, reparent applied history or downgrade.
- Root reports an approved one-day same-project recovery snapshot
   **`br-cold-credit-b11o29gv`**, PG18.6/schema6b1. Root's **16:37:29 UTC** read-only
   full readback matches all33 table values using salted server-side SHA-256,
   columns/defaults, 223 indexes and470 constraints; email default is literal true
   on both. This supersedes older count/PK-only evidence. No migration has run;
   equality is not candidate migration/runtime/restore acceptance or retention
   beyond the approved day. No live reads occurred in this agent workspace.
- Qualified staging backend: source
  `59320f31b3e6708050a2a17516ae967d39fe4d9f`, image
  `europe-west1-docker.pkg.dev/lenslayer/lenslayer/platform-staging@sha256:b5888edb70c1db3468b9937e43db41641a8fef955573aca9c258c9867ee42233`.
  This is **not** a final merged-release image. Saved successful CI on `c926f196…`
  does not qualify this newer patch. Freeze/review final main bytes separately.
- The later [source-retention correction](source-retention-review.md) preserves
  contract/ledger records, durably retries source-object cleanup and fences expired
  reads/late reviews. It has distinct31 offline +12 local PG17.11 tests, not live
  acceptance. Review/rebuild the exact runtime and qualify PG18.6 plus real
  object-store/maintenance behavior before activating the document lane.
- Completed local integration now includes both independently reviewed P2 repair
  patches and portable migration fixtures: **66 offline +21 local PG17.11 tests**
  on the combined bytes. `CODE-COMPLETE.md` binds current paths/hashes. Earlier
  source/report hashes are historical, not the final release identity. Canonical
  CI and exact-image PG18.6 clone qualification remain root-owned; no activation
  is implied by local tests or the existing full-value recovery match.
- Both queues and existing recovery are paused. Worker: private, request-CPU,
  automatic scaling, service/revision min **0**, max **1**, concurrency **1**,
  drain **120s**, timeout **300s**. No idle polling. Min-zero is configuration,
  not a measured current zero-instance count.
- Queue-only Enqueuer and invoker-account-only Service Account User are already
  approved/applied. Worker-only Invoker is **also explicitly approved**, but awaits
  the absent production worker resource. This does not authorize deployment.
- Main protection is now approved/applied per root. Merge, final plan review,
  recovery/acceptance/activation and SDK publication remain distinct gates. No paid
  model call, Calendar action, email, signing or publication is authorized here.

## 1. Offline source, manifest and migration-path check

Run from an approved **final main checkout**, not this untracked delegated copy.
Set `RELEASE_COMMIT` to its reviewed full identity and `RELEASE_DIR` to a new
private absolute directory outside the checkout. These are non-secret coordinates.
Use a dedicated Bash session with fail-fast enabled; stop on every failed check.

```sh
set -euo pipefail
umask 077
: "${RELEASE_COMMIT:?reviewed final main commit required}"
: "${RELEASE_DIR:?new private absolute directory required}"
test "$(git rev-parse HEAD)" = "$RELEASE_COMMIT"
test -z "$(git status --porcelain --untracked-files=all)"
mkdir "$RELEASE_DIR"
git archive --format=tar --output="$RELEASE_DIR/source.tar" "$RELEASE_COMMIT"
shasum -a 256 "$RELEASE_DIR/source.tar" > "$RELEASE_DIR/source.tar.sha256"
mkdir "$RELEASE_DIR/source"
tar -xf "$RELEASE_DIR/source.tar" -C "$RELEASE_DIR/source"
python3 scripts/prepare-production.py --source-commit "$RELEASE_COMMIT" --previous-revision lenslayer-api-00007-2jm --output "$RELEASE_DIR/draft-plan"
python3 -m unittest discover -s tests -p test_production_release.py -v
```

A clean-tree requirement never authorizes deleting user files. Use a clean
approved checkout. Inspect archive members/build-context exclusions before upload:
no `.env`, credentials, private bundles, production dumps or omitted launch-video
document. Never upload this delegated workspace.

Run the dependency-free, merge-aware graph preflight on the final archive. These
three paths now converge; graph reachability is not database-shape/data acceptance:

```sh
python3 "$RELEASE_DIR/source/scripts/check_production_migration_path.py" --from-revision=6b1d3e8f2c57 > "$RELEASE_DIR/production-path.json"
python3 "$RELEASE_DIR/source/scripts/check_production_migration_path.py" --from-revision=bf84e2c19a67 > "$RELEASE_DIR/staging-path.json"
python3 "$RELEASE_DIR/source/scripts/check_production_migration_path.py" --from-revision=fresh > "$RELEASE_DIR/fresh-path.json"
```

Manifest pins (unchanged; suffixes have `lenslayer-` prefix):

| Secret suffix | Version | Use |
| --- | --- | --- |
| `neon-direct-url` | 4 | Migration only |
| `neon-pooled-url` | 4 | API/worker/review job |
| `r2-access-key-id` / `r2-secret-access-key` | 2 / 2 | Private storage |
| `cloudmersive-api-key` / `resend-api-key` | 2 / 2 | Existing document lane |
| `groq-api-key` | 1 | Document analysis, not hosted-model authorization |

Pins are intended references, not enabled-version proof. Root-only metadata check
(never use `secrets versions access`):

```sh
python3 - <<'PY'
import json, subprocess
config = json.load(open('deploy/gcp/production-release.json'))
for suffix, version in sorted(config['secret_versions'].items()):
    subprocess.run(['gcloud', 'secrets', 'versions', 'describe', version,
        '--secret=lenslayer-' + suffix, '--project=lenslayer',
        '--format=json(name,state)'], check=True)
PY
```

Require every version ENABLED and existing resource-scoped runtime access. Never
substitute `latest`, staging refs, development subscription credentials or a
hosted-model key. Calendar/model remain disabled in this core release.

## 2. Root-only read-only parked-state and IAM checks

Retain timestamped sanitized output. These commands do not mutate resources.
Absent worker is expected **now**, not private-worker acceptance. Missing production
recovery is not a pass; do not create it to make preflight green.

```sh
gcloud run services describe lenslayer-api --project=lenslayer --region=europe-west1 --format='json(status.latestReadyRevisionName,status.traffic)'
gcloud tasks queues describe lenslayer-agent-work --project=lenslayer --location=europe-west1 --format='json(name,state,rateLimits,retryConfig)'
gcloud tasks queues describe lenslayer-agent-work-staging --project=lenslayer --location=europe-west1 --format='json(name,state,rateLimits,retryConfig)'
gcloud scheduler jobs describe lenslayer-agent-recovery --project=lenslayer --location=europe-west1 --format='json(name,state,schedule,timeZone,httpTarget.uri,httpTarget.httpMethod,httpTarget.oidcToken,attemptDeadline)'
gcloud scheduler jobs describe lenslayer-agent-recovery-staging --project=lenslayer --location=europe-west1 --format='json(name,state,schedule,timeZone,httpTarget.uri,httpTarget.httpMethod,httpTarget.oidcToken,attemptDeadline)'
gcloud tasks queues get-iam-policy lenslayer-agent-work --project=lenslayer --location=europe-west1 --format='json(bindings)'
gcloud iam service-accounts get-iam-policy lenslayer-agent-wake@lenslayer.iam.gserviceaccount.com --project=lenslayer --format='json(bindings)'
gcloud run services describe lenslayer-agent-worker --project=lenslayer --region=europe-west1 --format='json(metadata.annotations,spec.template.metadata.annotations,spec.template.spec.containerConcurrency,spec.template.spec.timeoutSeconds,spec.template.spec.serviceAccountName,status.url,status.latestReadyRevisionName,status.traffic)'
gcloud run services get-iam-policy lenslayer-agent-worker --project=lenslayer --region=europe-west1 --format='json(bindings)'
```

Require PAUSED for existing queues/recovery; stop on drift. Queue bounds: one
concurrent dispatch, one/sec, eight attempts, 10s–300s backoff, 86400s retry duration.
The renderer now updates existing queues **after pause**; create-if-absent alone
did not correct drift. Recovery must target canonical worker `/recover`, POST,
hourly `0 * * * *`, Africa/Lagos, exact worker-origin audience and wake identity.
Inspect existing job before update; verify update preserves PAUSED. Creating a
job may enable it immediately, so creation is activation-window-only.

After approved deployment require worker service/revision minima 0/maxima 1,
concurrency 1, CPU throttling true, scalingMode absent/automatic, and
invoker-iam-disabled absent/false. Verify effective request billing when defaulted.
Reject allUsers/allAuthenticatedUsers and unreviewed Invoker grants; check inherited
project/folder permissions too. Runtime identity is
`lenslayer-runtime@lenslayer.iam.gserviceaccount.com`. Staging API has distinct
max-three/concurrency-twenty settings; do not treat it as a worker.

## 3. Production backup and isolated PG18.6 restore rehearsal

**Not executed here.** Root must approve the production read and private data
handling. Use PostgreSQL **18** tools, preferably exact **18.6**: pg_dump 17 cannot
dump an 18 server. Set `RECOVERY_DIR` to a new private directory **outside source
and build trees**. `PGSERVICEFILE` points to the operator's existing protected
libpq service file; do not print it. Service `lenslayer-production-direct` must
resolve to the independently verified production **direct** endpoint with approved
TLS, not pooled/staging. No URL/password on argv, credential creation or export.
Root's subsequently verified recovery snapshot above already exists. The dump
commands are an alternative/future approved procedure, **not a request to repeat
production reads** for the candidate migration task. Clone testing below can use
the approved recovery point after plan approval.

```sh
set -euo pipefail
umask 077
: "${RECOVERY_DIR:?new private absolute backup directory required}"
: "${PGSERVICEFILE:?existing protected operator service file required}"
export RECOVERY_DIR PGSERVICEFILE
mkdir "$RECOVERY_DIR"
pg_dump --version
pg_restore --version
psql --version
```

Keep dispatch/recovery paused. Before an actual recovery cutover/migration,
separately fence **all** writers under a reviewed maintenance procedure: paused
agent queues do not fence API/document/email/retention writers. The following
uses one MVCC snapshot for dump and counts, not a later live count. It does not
cover post-snapshot writes, R2, OAuth keys or external effects.

```sh
psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --dbname=service=lenslayer-production-direct <<'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15min';
SET LOCAL idle_in_transaction_session_timeout = '0';
SELECT pg_export_snapshot() AS backup_snapshot \gset
\setenv LENSLAYER_BACKUP_SNAPSHOT :backup_snapshot
\getenv recovery_dir RECOVERY_DIR
\set metadata_path :recovery_dir /source-metadata.txt
\set counts_path :recovery_dir /source-counts.txt
\o :metadata_path
SELECT 'snapshot_utc=' || (transaction_timestamp() AT TIME ZONE 'UTC')::text;
SELECT 'server_version=' || current_setting('server_version');
SELECT 'schema=' || version_num FROM public.alembic_version ORDER BY version_num;
\o :counts_path
SELECT format('SELECT %L || ''='' || count(*)::text FROM %I.%I;', schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
\o
\! pg_dump --dbname=service=lenslayer-production-direct --format=custom --no-owner --no-acl --snapshot="$LENSLAYER_BACKUP_SNAPSHOT" --file="$RECOVERY_DIR/production.dump"
\if :SHELL_ERROR
  SELECT 1 / 0; -- ON_ERROR_STOP makes a failed dump a nonzero psql exit.
\endif
COMMIT;
SQL
pg_restore --list "$RECOVERY_DIR/production.dump" > "$RECOVERY_DIR/archive-list.txt"
shasum -a 256 "$RECOVERY_DIR/production.dump" > "$RECOVERY_DIR/production.dump.sha256"
```

Require source metadata schema `6b1d3e8f2c57` and PG18.6; stop on divergence.
Dump contains application data: encrypted private storage and approved retention
only. Never attach dump/SQL rows, URLs or credential files to builds/public issues.
Record backup timestamp/expiry. Set `RESTORE_IMAGE` to an independently reviewed
**postgres:18.6 image digest**, already available locally, not a mutable tag, and
`RESTORE_CONTAINER` to a fresh unique name. No cloud endpoint/app/worker is used:

```sh
: "${RESTORE_IMAGE:?reviewed postgres@sha256 digest for 18.6 required}"
: "${RESTORE_CONTAINER:?fresh rehearsal-only container name required}"
docker image inspect "$RESTORE_IMAGE" --format '{{json .RepoDigests}}'
docker run --name "$RESTORE_CONTAINER" --network=none --memory=1g --cpus=1 --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB=lenslayer_restore --mount "type=bind,src=$RECOVERY_DIR,dst=/recovery,readonly" --detach "$RESTORE_IMAGE"
docker exec "$RESTORE_CONTAINER" pg_isready --username=postgres --dbname=lenslayer_restore
docker exec "$RESTORE_CONTAINER" psql --no-psqlrc --username=postgres --dbname=lenslayer_restore --tuples-only --no-align --command='SHOW server_version;'
docker exec "$RESTORE_CONTAINER" pg_restore --username=postgres --dbname=lenslayer_restore --exit-on-error --single-transaction --no-owner --no-acl /recovery/production.dump
docker exec "$RESTORE_CONTAINER" psql --no-psqlrc --username=postgres --dbname=lenslayer_restore --tuples-only --no-align --command='SELECT version_num FROM public.alembic_version ORDER BY version_num;'
docker exec -i "$RESTORE_CONTAINER" psql --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --username=postgres --dbname=lenslayer_restore > "$RECOVERY_DIR/restored-counts.txt" <<'SQL'
SELECT format('SELECT %L || ''='' || count(*)::text FROM %I.%I;', schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
\gexec
SQL
diff -u "$RECOVERY_DIR/source-counts.txt" "$RECOVERY_DIR/restored-counts.txt"
```

Wait for pg_isready success before restoring (bounded operator wait, not a pass on
startup latency). Require PG18.6, original schema and exact snapshot counts,
including ledger/reservations if present. Record elapsed backup/restore time,
artifact hash, snapshot time, counts and exit codes. Restore omits ownership/ACLs;
validate production mapping separately. This is DB-only rehearsal, not full DR.
The shell-error check deliberately uses an SQL error with `ON_ERROR_STOP`:
PostgreSQL 18 `\quit` has no exit-code argument. Quiet, tuples-only output keeps
psql status messages out of the compared count files. Syntax/reference review is
not evidence that this production backup or restore has run.

The lineage blocker has a tested **candidate resolution**, not live acceptance.
See [migration lineage and compatibility](production-migration-lineage.md) for the
three paths, exact frozen-image clone-only upgrade/check commands, protected
legacy-value checks and remaining limits. Run only after root approves that plan.
Never repoint the production migration job to a test URL. Require actual PG18.6
recovery-clone evidence in addition to local PG17.11 tests. The merge blocks
downgrade before historical legacy-column drops can run.

After retaining evidence, remove only the fresh rehearsal container/anonymous
volume; keep backup under owner retention:

```sh
docker rm --force --volumes "$RESTORE_CONTAINER"
```

Staging recovery branch expiry is 16 October 2026 00:00:52 Africa/Lagos. Its
read-only schema/data check/autosuspend is not a production backup/restore.
Production recovery-point retention, R2/key recovery and RPO/RTO remain review gates.

## 4. Frozen image, final plan and separately gated rollout

Only after final main/source review and **build authorization**, submit the exact
extracted archive, never the working tree:

```sh
gcloud builds submit "$RELEASE_DIR/source" --project=lenslayer --config="$RELEASE_DIR/source/deploy/gcp/cloudbuild.release.yaml" --substitutions="_SOURCE_COMMIT=$RELEASE_COMMIT"
gcloud artifacts docker images describe "europe-west1-docker.pkg.dev/lenslayer/lenslayer/platform:release-$RELEASE_COMMIT" --project=lenslayer --format='value(image_summary.digest)'
```

Root retains Cloud Build ID/result/archive checksum and verifies the image OCI
`org.opencontainers.image.revision` **at its digest** against the reviewed commit.
The label alone is not source proof: uploaded archive, build and CI must agree.
The Docker base tag and Python requirement ranges are not fully reproducible
dependency pins. Source equality alone does not qualify a rebuilt image: retain
resolved dependency/build evidence and qualify the actual final image digest.
Set `IMAGE_DIGEST` to that reviewed sha256 and `WORKER_ORIGIN` to production
`status.url` after separately approved bootstrap. Renderer rejects ports (even
:443), credentials, paths, queries, staging hosts and mutable image tags. Match
host to actual GCP status; the host regex alone does not prove resource ownership.

```sh
: "${IMAGE_DIGEST:?exact final reviewed sha256 required}"
: "${WORKER_ORIGIN:?actual canonical production status.url required}"
python3 scripts/prepare-production.py --source-commit "$RELEASE_COMMIT" --image-digest "$IMAGE_DIGEST" --worker-origin "$WORKER_ORIGIN" --previous-revision lenslayer-api-00007-2jm --output "$RELEASE_DIR/final-plan"
shasum -a 256 "$RELEASE_DIR/final-plan/plan.json" "$RELEASE_DIR/final-plan/runtime-env.json" "$RELEASE_DIR/final-plan/api-env.json" "$RELEASE_DIR/final-plan/bootstrap-env.json"
```

Plan records seven numeric secret versions and one digest for bootstrap/migration/
API/worker/review job. Bootstrap HTTP uses mode `continuous`, hosted agents false,
**only to disable `/drain` and resolve URL**; it launches no continuous worker
loop. It is not final on-demand acceptance. Re-render with real origin and deploy
sleeping worker while queue/recovery remain paused.

After separate deployment approval and verified recovery/clone migration, root
may configure/execute the zero-retry migration job, deploy private worker and
no-traffic API. Compare effective ready revisions, not just service templates:

```sh
gcloud run revisions describe "$WORKER_REVISION" --project=lenslayer --region=europe-west1 --format='json(metadata.name,metadata.annotations,spec.containerConcurrency,spec.timeoutSeconds,spec.serviceAccountName,spec.containers.image,spec.containers.env.name,spec.containers.env.valueFrom.secretKeyRef,status.imageDigest)'
gcloud run revisions describe "$API_RELEASE_REVISION" --project=lenslayer --region=europe-west1 --format='json(metadata.name,spec.containers.image,spec.containers.env.name,spec.containers.env.valueFrom.secretKeyRef,status.imageDigest)'
gcloud run jobs describe lenslayer-migrate --project=lenslayer --region=europe-west1 --format='json(spec.template.spec.template.spec.containers.image,spec.template.spec.template.spec.containers.env.name,spec.template.spec.template.spec.containers.env.valueFrom.secretKeyRef)'
curl --silent --output /dev/null --write-out '%{http_code}\n' "$WORKER_ORIGIN/health/live"
```

Anonymous worker response must be 401/403, not 2xx. Independently verify allowed
identity invocation, wrong-identity denial, private-worker behavior, OIDC/health
and unchanged API traffic. Never POST `/drain` or `/recover` as a harmless probe:
they can dispatch real work. Do not execute the review job as a sleep test; it can
send email/call providers. Root verifies model false/0/no hosted-model key and
Calendar false in private allowlisted configuration review, without arbitrary env
dumps. Existing Groq document key is distinct from a hosted-model key.

The legacy `check_on_demand_deployment` guard remains an **active-operation**
guard, not a parked-rollout preflight: do not run its `--check-cloud` mode to
qualify this paused release. Its focused offline tests now also reject foreign
project/region, explicit origin ports, retry/recovery drift and a missing
service-level max-one annotation (absence is not proof of max one).

Only after acceptance and **fresh activation approval** may root run reviewed
recovery create/update/readback/resume, exact-release traffic promotion and queue
resume in an owner-reviewed order. An existing job is now explicitly retargeted;
resuming a stale create-if-absent job is not acceptable. Verify target/audience/
identity, IAM/scaling and desired states after each approved change.
Skip recovery resume when a newly created job is already enabled; never treat an
unexpected preexisting enabled job as approval to proceed.

Emergency park / traffic rollback **before new-feature data** (commands only):

```sh
gcloud tasks queues pause lenslayer-agent-work --project=lenslayer --location=europe-west1
gcloud scheduler jobs pause lenslayer-agent-recovery --project=lenslayer --location=europe-west1
gcloud run services update-traffic lenslayer-api --project=lenslayer --region=europe-west1 --to-revisions=lenslayer-api-00007-2jm=100
```

If recovery is absent, record absence instead of hiding another error. After new
data/effects, park and inspect before rollback/forward fix. Never downgrade ledger,
reset reservations, replay uncertain Calendar POSTs or restore old DB over newer
effects. Production restore/external-effect reconciliation require their own
reviewed commands/authorization; this isolated rehearsal is not that operation.
