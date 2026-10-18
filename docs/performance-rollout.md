# Performance rollout and owner-only measurements

Nothing in this programme has been merged or deployed. No production DDL, paid provider request, queue, IAM, schedule, region or minimum-instance change is authorized.

## Review and deployment order

1. Review the resolved `perf/combined-review` PR #21 against main `e16c471`, **including the repairs in follow-up #22**, which targets that integration branch. The separate #13–#20 PRs provide focused review slices. Prefer one repaired/tested combined snapshot; do **not** merge the aggregate and replay the same constituent patches. If choosing individual tracks instead, re-integrate/retest all overlap fixes and the five repairs described in `performance-follow-up.md`; #16 requires #15. No PR is merged by this work.
2. Use the existing owner-controlled release/staging procedure and immutable images. No schema changes are required. Backend query/stream routes must precede dashboard callers; old clients remain compatible. Deploy only on explicit owner approval, with synthetic data in the existing approved environment and providers disabled/faked.
3. Check legacy JSON arrays, private no-store headers, cross-tenant denial, anonymous public pages, remembered workspace selection, expiry/refresh/signout/account replacement, CSRF mutations and Q&A interruption. Exercise the landing keyboard/theme/FAQ/carousel controls on phone and desktop. Test a final-attempt crash against a synthetic record and confirm one terminal failure, not a provider replay.
4. Verify no full collection request on unrelated dashboard navigation; 25-row pages and SQL counts agree, including midnight/week/month boundaries. Verify NDJSON reaches the browser before provider completion through the **actual** approved proxy, with `X-Accel-Buffering: no`; an unsupported/buffering proxy is not proven fixed by local ASGI tests.
5. Observe existing health/error/latency metrics and approved natural user traffic. Do not generate recurring warmup traffic. Keep request-billed CPU, minimum zero and bounded drains. Preserve the US$1/three-admission DeepSeek accounting and explicit consent; do not consume remaining allowance to benchmark.
6. Follow-up staging acceptance:20 synthetic uploads under approved load must bound endpoint materialization and report overload503/Retry-After without automatic replay; verify real ingress/proxy buffering separately. Six slow fake streams must not occupy idle auth checkouts. Calendar's42-day counts/previews must remain complete as agenda pages change, including adjacent dates and DST. `/tasks → /contracts → /tasks` must preserve shell/cache and avoid repeated fresh metadata/record reads. Check original session-deadline expiry, revocation, account/signout and remembered organization on the persistent shell. Verify used-evidence edits/deletion block final output while unrelated edits do not rerank. Deploy the additive calendar/count APIs before the matching dashboard.

## Rollback

Keep the preceding reviewed API/worker/dashboard/landing image digests. Roll dashboard callers back **before** removing additive API routes. JSON Q&A still exists, so a reviewed client-only rollback can use it without data migration. If stream/proxy behavior fails, revert client adoption, not authentication/citation checks. Revert only the relevant performance patch/image, not unrelated owner/security work. No destructive database rollback is needed.

Already-committed audit/notification/failure records are not undone by rolling back worker code. Never reset attempts, restore purged source text, recreate approvals or replay provider writes to simulate recovery. Generated landing assets/fonts are versioned; restore the preceding matched HTML/assets atomically.

## Remaining owner-dependent work (not infrastructure fixes claimed complete)

### 1. Attributed natural cold/warm and geography evidence

Scope: existing read-only Cloud Run/SQL metadata, existing logs/metrics, normal bounded observations. Cost: normal read/observability and a few request-based health invocations; no idle cost or warming schedule. Actual database/provider geography is still unverified.

Use metadata-only projections, never dump environment variables or bearer headers:

```sh
gcloud run services describe lenslayer-api --project "${APPROVED_PROJECT_ID:?Set the existing approved project ID}" --region europe-west1 --format='yaml(status.latestReadyRevisionName,spec.template.metadata.annotations,spec.template.spec.containerConcurrency,spec.template.spec.timeoutSeconds)'
gcloud run services describe lenslayer-agent-worker --project "${APPROVED_PROJECT_ID:?Set the existing approved project ID}" --region europe-west1 --format='yaml(status.latestReadyRevisionName,spec.template.metadata.annotations,spec.template.spec.containerConcurrency,spec.template.spec.timeoutSeconds)'
gcloud sql instances list --project "${APPROVED_PROJECT_ID:?Set the existing approved project ID}" --format='table(name,region,databaseVersion)'
```

Set `APPROVED_PROJECT_ID` from the existing approved deployment configuration, not a guessed/new resource. Correlate first-byte latency with existing instance startup/revision/request timestamps. The three recorded health samples (9721.533, 398.294, 394.167ms) have **no instance correlation**, so they do not prove a cold start. Inspect scanner/provider residency from the actual approved account/contract documentation without making paid calls. No region move is proposed.

### 2. Upload dispatch attribution and existing fallback

Scope: existing queue/job/task/recovery metadata and already-authorized synthetic staging execution; no new production upload. Correlate timestamps: upload admitted, scan start/end, durable job commit, trigger accepted/failed, worker request received, job claimed, extraction start. Separate these from SQL/provider time. Record safe durations/status/request IDs only, not filenames/document text/tokens. Confirm the existing hourly failed-trigger recovery actually targets the document lane and can reach queued work after a missed trigger. Recovery code now handles crashed final attempts **when activated**; it cannot guarantee prompt activation after every trigger failure.

Acceptance: durable one-winner execution, no retry after terminal exhausted recovery, no source rehydration after retention, empty activation exits, minimum-zero/request CPU unchanged. If dispatch changes are needed, submit a **separate exact** queue/schedule/IAM/cost plan first. No new resource is proposed/approved here; increasing idle polling is explicitly excluded.

### 3. Authenticated browser and device validation

Owner uses a disposable/synthetic workspace with existing credentials in the browser, never exports cookies/HAR bodies. Capture sanitized request names/durations on `/tasks`, a retained contract, and workspace/account replacement. Compare the same build/profile/fixtures before and after; include refresh-error/revocation and a slow API. The 750ms server projection is best-effort: a cold/slow API falls back to normal client loading/error behavior, not cached authorization. Verify repeated server layouts do not rotate provider refresh tokens in read-only contexts.

Run real Android checks if a device is available. Field LCP/CLS/**INP** requires actual approved field data at p75 separately for phone/desktop; emulated Lighthouse and CDP are not field/device proof. No analytics service or private-content collection is proposed. Assess whether private startup gains justify enabling any further hydration/prefetch strategy; retain unfavorable local results too.

### 4. PostgreSQL/index decisions

Local PG17.11 read-only `EXPLAIN (ANALYZE, BUFFERS)` uses synthetic UUID schemas; CI uses PG18.6. Follow-up plans add1000/10000-record~4KB source fixtures, actual LIKE ranking and representative window/count/filter/sort/deep-offset queries with three samples and retained full plans. No production plan or production index performance claim is made. Authorized search/count scans still scale with matching database work despite bounded returned/materialized rows. The fixture supports removing repeated ranking, not a production index migration or DDL. If production metadata permits a more representative disposable copy, rerun the fixtures, examine selectivity/rows/buffers/sorts, and propose only justified indexes separately. Never `ANALYZE` a mutating production statement.

### 5. Dependency audit warnings

Installation reported existing high-severity advisories in dashboard/MCP/landing dependency trees. This programme adds no app dependencies or upgrades and does not run `npm audit fix --force`. Owner security triage should inspect lockfile advisories in a separate review, preserving current release policy. These warnings are not test failures and do not establish their exploitability here.
