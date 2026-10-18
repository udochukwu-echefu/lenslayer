# Performance review repairs: PR #22

## Scope and delivery

This is a repair of the five findings in the owner's 18 October review of [#21](https://github.com/udochukwu-echefu/lenslayer/pull/21), not a rebuild of the eight performance tracks. [#22](https://github.com/udochukwu-echefu/lenslayer/pull/22) targets `perf/combined-review`, so its diff contains only the follow-up. All performance PRs remain unmerged; nothing was deployed or activated. The dirty primary checkout and original owner probes remain untouched. No subagents were used.

Baseline is `ca704aa272d1dc00548726a22fda1f91a40c587e`; measured repaired product is `691bf0b2f45244c1b1ae620306d975bb5c9bacdf` (with the intermediate code revisions recorded in individual reports). Later changes add tests, reports and harness metadata, not product bytes. Fresh remote checks and current CI are recorded in the PR. Main remains `e16c4711eb1220c438aae4e74138a3da5581e392` at the final fetch.

Original evidence is not overwritten. New raw synthetic reports, source/tool/configuration metadata, computed medians/ranges and SHA-256 inventory: [`performance/follow-up/manifest.json`](performance/follow-up/manifest.json) and [`summary.json`](performance/follow-up/summary.json). Screenshots, computed-style inventories and complete test logs remain in the isolated local `performance-follow-up` directory beside this worktree. Retained timings are local lab/ASGI results, **not production, real Android, field INP or live-provider timings**.

## Fix-to-evidence table

| Finding | Repair | Correct-behavior evidence |
| --- | --- | --- |
| P1 stream auth connection held throughout generation | Stream-only scalar identity dependency closes its own session before preparation/generation. Global yielded dependencies unchanged. | `tests/test_qa_stream_resources.py`: genuine two-connection/no-overflow pool, six simultaneously paused returning-user streams, unrelated authenticated read, baseline checkouts during waits and after success/failure/timeout/disconnect (including before first content). Same tests pass on disposable PostgreSQL. Whole-stream benchmark records paused pool **1 → 0**, final pool0. |
| P1 upload bodies materialized before admission | Six upload actions admit before multipart parsing, with short authorization preflight, execution recheck, fixed2C backlog and explicit503/Retry-After. Request/parser and worker jointly own release. | `tests/test_upload_admission.py`: capacity2,20 real ASGI multipart requests/~2MiB documents: **2 parsers/2 complete bodies/4 unparsed waiters/14 overloads before release** on every route. Raw JSON records bytes/spools. Denied/outsider requests bypass waiting/scanning; unrelated reads respond. Queued, partially parsed and running cancellation, scan/storage/commit failures and spool/object/session cleanup are asserted. These are body counts, not RSS or proxy-buffer measurements. |
| P2 calendar occupied days disappear as agenda pages change | Authorized42-day local-date grid returns exact counts and up to3 previews/day, separately from paginated task/lifecycle agendas. Month totals exclude adjacent dates. | `tests/test_calendar_grid.py`:31 task+life days, adjacent dates,2010-item dense day with3 previews, stable payload/query bound, empty ranges, tenant/private headers, invalid zones/extreme dates,23/25-hour DST boundaries. Same tests pass on PostgreSQL. `calendar-grid.test.tsx` changes both agenda pages/sort without losing first/last-day entries or truthful overflow. |
| P2 private navigation remounts cache and repeats bootstrap | One `(workspace)` route-group layout preserves URLs, shell and account QueryClient. Public layouts remain separate; Calendar consent return retains provider context. Original-expiry timer clears persistent state without server polling. | Actual production-browser `/tasks → /contracts → /tasks` traces,3 runs with speculative prefetch disabled plus3 with normal prefetch: clients/shells **1→2→3 becomes1→1→1**; `/me` and `/organizations` **3 each →1 each**; Tasks list calls **2→1**. In-flight filter abort observed. Unit tests cover account/signout/revocation/expiry, remembered workspace, cache invalidation, late responses and750ms projection fallback. |
| P2 heartbeat/final checks repeat full portfolio ranking | Rank/materialize once; snapshot the used sources; later SQL selects exact tenant IDs and SHA-256 of effective evidence, title/review ID/retention eligibility. No timestamp immutability assumption. | Whole-stream fake-provider benchmark at100/1000 portfolios/~20.8KB sources, plus SQL capture tests: one rank/24 candidates once, then at most8 used sources hashed without full-body transfer or ORDER BY/reranking. Membership/JWT/retention/deletion/used in-place edits/review replacement still block final audit. An unrelated edit does not rerank or switch evidence. PostgreSQL uses built-in SHA-256, no extension/DDL. |

## Repeated browser navigation

Identical harness digest in each pair; Chrome155/Node24, isolated production Next16.3.8 builds, synthetic encrypted cookie, same account/workspace,390×844/DPR1, loopback plus80ms fake upstream. Three serial fresh-context runs per revision/mode; section revisits stay within existing15-second cache freshness. These navigation runs are intentionally unthrottled, unlike the original mobile startup/Lighthouse comparisons. React DevTools commit observations identify actual QueryClient instances; DOM identity tracks the shell. The extra slow500ms contract filter is aborted after leaving its observer.

| Navigation elapsed, ms | Before median [min–max] | After median [min–max] |
| --- | --- | --- |
| Contracts, prefetch disabled | 404.4 [393.0–412.9] | 123.3 [115.3–133.8] |
| Tasks revisit, prefetch disabled | 416.3 [415.6–417.1] | 21.4 [20.0–23.1] |
| Contracts, normal prefetch | 402.8 [401.5–419.3] | 134.6 [131.0–144.3] |
| Tasks revisit, normal prefetch | 415.5 [413.2–416.0] | 21.5 [20.5–21.7] |

All28 phone/desktop/light/dark **public** computed-style/geometry inventories match exactly and the captured public pages have no runtime errors. Landing bytes, typography, CSS and component colors are unchanged from #21. Browser request abortion is not proof that a deployed proxy cancels its upstream PostgreSQL/provider work. Real Auth0/proxy/account/device behavior remains owner-gated; unit mocks and synthetic cookies do not establish it.

## Whole-stream Q&A

The harness executes complete ASGI streams, not isolated retrieval calls. Same synthetic returning user,100/1000 portfolios, approximately20.8KB source text, one untimed local fake-stream warmup then three samples per size/revision. The fake model pauses for three30ms heartbeat intervals; shortening this interval makes repeated database work visible without paid calls or a long idle test. Materialization counters include **every** invocation; SELECT counters cover the full request, not only retrieval. Final timings retain first-content/provider/total breakdowns.

Each complete sampled stream performs **6 ranking passes →1**, **144 full-text candidate rows →24**, **2995200 full-text bytes →499200**, and **31 SELECTs →21**. The repaired stream uses five exact-source hash checks in this workload. Pool checkout during the provider pause is1 before versus0 after; both return to0 after completion.

| Fake stream, ms | Before median [min–max] | After median [min–max] |
| --- | --- | --- |
| 100 records, first content | 21.3 [17.3–22.0] | 17.9 [13.2–20.4] |
| 100 records, complete stream | 151.0 [140.9–151.2] | 122.0 [113.5–125.7] |
| 1000 records, first content | 77.1 [76.1–80.3] | 54.3 [43.2–55.3] |
| 1000 records, complete stream | 325.7 [323.3–326.3] | 156.3 [144.9–157.3] |

Raw `qa-before.json`, `qa-after.json` and computed summary retain all samples and timing breakdowns. These timings include local scheduling/revalidation and an intentionally controlled wait, not faster live model generation. Earlier unwarmed runs retained separately include1.5–3-second local lazy-import outliers; warmup was added equally to both revisions to avoid treating import initialization as provider/network time. Initial ranking still scans tenant content; the fix removes repeated scans and transfers, not the first scan. Revalidation still hashes the current bytes of used evidence in SQL and is not zero-cost or an authorization cache.

## Measured count projection and PostgreSQL plans

The Tasks screen only consumed three Overview counts. Same1000-record disposable SQLite fixture, one warmup/five samples: full Overview **12 SELECTs/12218 decoded JSON bytes/7.95ms median [7.74–9.23]** versus Tasks counts **3 SELECTs/62 bytes/2.25ms [2.18–2.55]**. This justified one narrow additive `/query/tasks/counts` projection and its demo adapter. Overview's existing payload/other callers are unchanged; task mutations invalidate both pages and counts. Gzip sizes are computed, not measured transport. Count/tenant/date/private-header regressions pass on SQLite and PostgreSQL.

Larger disposable PostgreSQL fixtures contain1000 then10000 additional contracts/reviews/tasks plus121 baseline records,~4KB mixed non-repetitive source content and5% renewal matches. Three read-only `EXPLAIN (ANALYZE,BUFFERS)` samples/query/size, local PG17.11; no production database touched. Ranking uses the actual captured relevance query; list/sort statements are representative ORM window-query shapes. The retained complete JSON plans include buffers, row counts and sort methods, not just elapsed values.

| PG execution, ms | 1000 additional records, median [min–max] | 10000 additional records, median [min–max] |
| --- | --- | --- |
| LIKE ranking | 17.142 [16.999–18.168] | 179.393 [177.657–182.303] |
| Window count/first page | 0.513 [0.511–0.538] | 4.610 [4.604–5.005] |
| Window count/deep offset | 0.564 [0.561–0.596] | 5.509 [5.255–5.717] |
| Filtered title sort | 0.526 [0.521–0.543] | 5.373 [5.361–5.673] |

Conclusion: database scan cost is data-dependent and the initial LIKE ranking remains a scaling limitation. Removing repeated ranking is justified; this synthetic fixture does **not** justify production index DDL, a new search service or speculative rewrites of all pagination. Owner-approved representative plans/selectivity and real workload are needed before a separate index/search proposal.

## Verification and rollout gates

- Dashboard:429 tests in56 files; TypeScript production build passes. ESLint: no errors, one existing signout warning.
- Full disposable-PG-enabled backend at final product691bf0b:677 executed tests,3 external-only skips, no failures (169.7s). Local PG exercises both SQLite fixture suites and opted-in PostgreSQL variants. Strengthened23/25-hour DST assertions are additionally rerun on both databases.
- Upload focused regressions23/23; actual pool/stream resource tests and calendar regressions pass on both databases.
- SDK89/MCP10/planner23/example15 tests, builds and package/credential/provenance checks pass; report evaluation and disposable integration check pass. The first integration invocation ran before the builds existed and was rejected; the subsequent built invocation passed. No product tests were weakened to hide it.
- Staging helpers pass58 Node and33 Python tests without live services. Landing remains byte-identical to #21; its canonical production build/check are rerun locally and included in current CI.
- Existing dependency advisories remain disclosed; no upgrades or audit-force fixes. No production writes, secrets, providers/scanners, DDL, IAM/resources/regions/schedules or minimum-instance changes. DeepSeek'sUS$1/three-admission accounting, consent/reservations/no refill are unchanged; Groq Q&A is separate and faked here.

Before owner release: review #22 into #21's integration snapshot, verify the current GitHub `test` check, then use the existing staging procedure. Backend additive grid/count APIs precede dashboard callers. Exercise503/Retry-After under the real ingress, slow/cold bootstrap fallback, real Auth0 expiry/refresh/account change, dense calendar DST navigation, source revocation and first-token/final delivery through the actual proxy. Correlate dispatch/geography/cold starts using approved metadata only. Real Android and field p75 LCP/CLS/INP remain unverified. Request CPU/minimum-zero/bounded drains/no idle polling or warming stay invariant. No merge or deployment is authorized by this report.

Rollback: restore the preceding matched dashboard/API images using the existing process; dashboard callers before removing additive APIs. Do not revert security/retention/final-audit checks, reset budgets/attempts or replay writes. See [`performance-rollout.md`](performance-rollout.md).

## Reproduce

```sh
"/absolute/working/python" -m unittest tests.test_upload_admission tests.test_qa_stream_resources tests.test_calendar_grid
"/absolute/working/python" scripts/test-agent-generalization-postgres-local.py tests.test_qa_stream_resources.PostgresStreamResourceTests tests.test_calendar_grid.CalendarGridPostgresTests tests.test_followup_postgres_plans.FollowupPlanTests
"/absolute/working/python" scripts/benchmark-qa-stream.py /absolute/source-worktree /absolute/evidence/qa-final-before.json
PROFILE_NAVIGATION=1 PROFILE_NO_PREFETCH=1 node scripts/profile-startup-fixture.mjs /absolute/source-worktree /absolute/evidence/final-navigation-diagnostic-before SOURCE_SHA /absolute/puppeteer-core.js 3231
LENSLAYER_TEST_PYTHON="/absolute/working/python" npm --prefix dashboard test
"/absolute/working/python" scripts/package-performance-followup.py /absolute/performance-follow-up
```

Repeat against repaired worktree/output; set `PROFILE_NO_PREFETCH=0` for normal comparison. Build each dashboard with its unchanged lockfile first, use only synthetic fixture credentials, and never copy production `.env` files. Packaging takes fixed allowlisted report names, checks three browser samples/identical harness hashes/error-free visuals, and fails on changed public computed styles; it never overwrites the original evidence directory.
