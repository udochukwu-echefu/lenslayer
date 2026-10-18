# Performance results and review record

**Follow-up:** the owner's review of #21 found five remaining resource/correctness gaps not covered by the original results below. [PR #22 repair report](performance-follow-up.md) contains fixes, full-stream/pool/admission regressions, actual repeated browser navigation, measured count-only projection and larger disposable-PG plans. Original evidence/results below remain intact; do not interpret them as proving the five defects were absent.

## Scope and revisions

Implemented and locally verified all eight finding tracks; no merge/deployment or external activation. Focused PRs: #13 collaboration, #14 uploads, #15 bounded API, #16 bounded UI (depends on #15), #17 landing, #18 startup, #19 Q&A, #20 exhausted document leases. `perf/combined-review` is the resolved integration and authoritative cross-batch regression/evidence snapshot. See `performance-implementation.md` and `performance-rollout.md` for statuses and owner-only follow-ups.

Baseline file tree is real main `e16c4711eb1220c438aae4e74138a3da5581e392`, identical to initial dependency snapshot `18f851679478d0b63fc54526031e558095fcb16f`. Landing changes originate at `c50c3e0`; canonical final raw/build inventory records `cdbadfe` (same landing bytes, actual production app URL). Final dashboard/private/CSS source is `f8ee29c`. Backend synthetic benchmarks/reproduction record `53dbd8b`. Later report/packaging changes do not change measured product bytes. Raw source/config/version records take precedence over abbreviated SHAs here.

Committed, sanitized raw reports and SHA-256 inventory: [`performance/evidence/manifest.json`](performance/evidence/manifest.json). Raw Lighthouse JSON is `.json.gz` (decompress with `gzip -dc`); raw local HTML/screenshots and exploratory runs remain under `/private/var/folders/th/p6pw8fpd5492qwl6c3dp9wpc0000gn/T/opencode/performance-evidence/`. Tooling-only Puppeteer/Playwright are outside app dependencies. Original owner review artifacts are unchanged.

## Three-run mobile Lighthouse comparison

Chrome155, Lighthouse13.5, Node24.15, local production builds, fresh Chrome profiles/default cache reset. Simulated mobile 412×823/DPR1.75, 4×CPU, RTT150ms/throughput1638.4Kbit/s (complete settings retained). Vite preview uses 4180; Next sample ports differ only to avoid server collisions. Config digests include URL/port/build labels, so compare the actual retained settings rather than equating whole-config digests. These are lab samples, **not field CWV/INP, real Android or production cold-start measurements**. Original audit scores 82/93 were single runs, not these repeated medians.

| Surface / measure | Before median [min–max] | After median [min–max] |
| --- | --- | --- |
| Landing performance | 84 [83–86] | 99 [99–99] |
| Landing FCP, ms | 2801.624 [2769.103–2898.451] | 1351.867 [1351.776–1353.202] |
| Landing LCP, ms | 3531.016 [3455.764–3604.859] | 1952.801 [1952.664–1954.803] |
| Landing CLS | 0 [0–0] | 0 [0–0] |
| Landing transferred bytes | 301499 [301499–302103] | 145118 [145118–145118] |
| Landing decoded resource bytes | 514311 [514311–514311] | 352038 [352038–352038] |
| `/sample` performance | 95 [95–95] | 99 [99–99] |
| `/sample` FCP, ms | 1203.272 [1203.151–1204.416] | 1055.762 [1055.541–1057.814] |
| `/sample` LCP, ms | 2915.272 [2912.151–2915.417] | 2178.841 [2178.209–2179.694] |
| `/sample` CLS | 0 [0–0] | 0 [0–0] |
| `/sample` JS transfer / decoded bytes | 218386 / 692195 | 145334 / 474408 |
| `/sample` CSS transfer / decoded bytes | 43599 / 244778 | 11952 / 42668 |

Landing TBT stayed zero. Sample TBT increased from median5.5ms to12.5ms [11.5–13], while LCP/bytes improved; do not present every metric as improved or add overlapping estimated savings. Final landing LCP meets the documented ≤2.5s lab goal and CLS≤0.1. Final 80 visual/interaction checks pass; all 28 public phone/desktop/light/dark computed-style/geometry inventories match baseline exactly after correcting generated-style omissions.

## Private synthetic startup (separate from Lighthouse)

Three serial before/after fresh-context runs, 390×844/DPR1, CDP4×CPU, 150ms latency, 1.6Mbit/s down/750Kbit/s up, fake upstream80ms per request, encrypted synthetic cookie. Before and after are separate production servers with the identical local fake API workload, not real Auth0/provider/production traffic.

| Mark | Before median [min–max], ms | After median [min–max], ms |
| --- | --- | --- |
| `.app-shell` available | 2688.8 [2684.4–2691.6] | 2312.9 [2308.1–2317.7] |
| Settled synthetic task register | 2838.7 [2828.1–2838.8] | 2493.3 [2487.5–2495.5] |

Before: document → two browser session reads → parallel me/organizations → record requests. After: private request-local parallel me/organizations → browser bounded task/overview/notifications requests; **no browser session/metadata stage** with a valid projected session. Metadata still exists upstream and authorization is not removed. Public sample/auth/shared captures have no auth requests; invitation keeps one intentional session check.

Important unfavorable evidence: the earlier **unthrottled loopback** comparison was slower (settled tasks median290.1ms before vs385.9ms after; ranges285.1–406 vs385.6–401.5, raw exploratory reports retained). Removing a Suspense wrapper did not improve that result and was reverted. Fewer stages are not universally lower latency, especially on a tiny empty warm fixture; mobile transport is the explicitly measured benefit, not a claim that private startup is fixed in production. A slow/cold API projection now times out at750ms and falls back to normal client gates. Owner authenticated/proxy/device checks remain required.

## API, payload and query results

- Same independent fake one-second scanner workload, unchanged original script, separate output/import context only: baseline reported health0.85ms and during-upload1020.88ms; combined re-run baseline0.87ms and during-upload**1.48ms**, upload202. This proves event-loop isolation, not real scanner speed. Synchronized regression tests additionally cover slow storage, session ownership, bound four uploads and queued/running cancellation/failure cleanup.
- Same independent 20 distinct-author comments: **24 → 4 SELECTs**. Dedicated comments/decisions/approvals tests each stay4/4/4 at1/20/100 records, including nullable relationships. No identity-map shortcut with one repeated user.
- Same1000-contract/task/lifecycle synthetic SQLite fixture, one warmup/five samples. Complete legacy arrays remain1000 records. Contract page:419394 →10534 decoded JSON bytes;23.00 →6.17ms median [before15.90–37.70, after5.77–6.61]. Task page:631001 →15821 bytes;28.68 →8.40ms. Lifecycle page:519501 →13621 bytes;24.22 →8.03ms. Each bounded list returns25 and total1000. Overview12218 bytes/12 SELECTs; scoped search1458 bytes/4 SELECTs. Gzip sizes in the raw report are **computed**, not transport measurements.
- Shell full-array request count drops from two unconditional full collections to zero; on `/tasks`, the bounded page and aggregate are independent requests. In the same fixture contracts+tasks alone sum1050395 decoded bytes versus10534+15821 for one bounded page of each; this is a payload comparison, not a claim all navigation requests disappeared.
- Q&A1000-contract fixture: source materialization1000 →24, bytes1000006 →24006, retrieval median8.548 →3.208ms (three runs; before8.323–9.227, after2.954–4.418). A relevant10-year-old agreement remains found. At one contract, added relevance-query overhead makes it slower (0.259 →0.938ms); no blanket latency claim. Bounded materialization does **not** mean constant database scan cost.
- Fake-stream barriers prove provisional answer before generation finishes, provider closure on disconnect, no completed answer/audit on partial failure, final citations/retention/access checks and JSON compatibility. No paid evaluation was run; total provider generation improvement is unmeasured. Privacy-safe timing fields now make that separable.

Disposable PG17.11 tests repeat paging/date/tenant/count/recovery/retention checks and retain `EXPLAIN (ANALYZE, BUFFERS)` for read-only synthetic queries. The full617-test PG-enabled run passes, with3 external-only skips. No index migration is justified from this small fixture, and no production DDL was applied.

## Verification and review

- Backend full discovery:617 tests,193 skips without PostgreSQL opt-in; **not** claimed as617 passes. Full disposable-PG-enabled run:617 tests,3 externally gated skips, no failures. Focused PG query/recovery/retention run32/32 also passes.
- Dashboard:425 tests in54 files; TypeScript production build passes. ESLint passes with one existing signout navigation warning (not introduced here).
- Landing canonical production build/lint, three delivery tests and80 browser visual/interaction checks pass. A build missing `VITE_APP_URL` was rejected by exact-link checks and excluded from final results.
- SDK89, MCP10, bounded planner23, external example15 tests and SDK package allowlist/credential/provenance checks pass. Report quality gate and disposable API/worker integration checks pass. Initial Make invocation with a space-containing Python path failed shell tokenization; running the exact quoted interpreter directly passed, without weakening product tests.
- Existing dependency audit advisories are disclosed in rollout notes; no unrelated upgrades or `audit fix --force`.
- Independently inspected upload ownership, relationship eager loading, additive query auth/aggregate/date/search semantics, source materialization, stream final/cancel/retention checks, account caches and server-only credentials, CSS ownership and idle worker recovery. Integration review corrected timezone offsets/extreme-date overflow, inclusive/exclusive windows, remaining full contract-action reads, Q&A portfolio adoption/cancel-before-first-token, read-only refresh rotation, late account responses and stale generated public styles. No reviewer subagents were used after the user's prohibition.

GitHub checks are separate from local results. Inspect each PR's current `test` job before merge; reports must not turn queued/in-progress jobs into passes. The final aggregate PR records the current status. Deployment/rollback and exact remaining attributed production/auth/device measurements are in `performance-rollout.md`.

## Reproduce

Use a clean isolated checkout and the repository's working Python environment; never copy production `.env` files. See each batch/API document for detailed contracts. Core commands:

```sh
"/absolute/working/python" -m unittest discover -s tests -v
"/absolute/working/python" scripts/test-agent-generalization-postgres-local.py tests.test_workspace_queries_postgres tests.test_document_lease_recovery.PostgresDocumentLeaseRecoveryTests tests.test_source_retention.PostgresRetentionTests
"/absolute/working/python" -m tests.test_workspace_queries --benchmark --output /absolute/evidence/workspace-queries.json
"/absolute/working/python" -m tests.qa_retrieval_benchmark
"/absolute/working/python" scripts/reproduce-performance-review.py /absolute/original/reproduce.py /absolute/separate-output
LENSLAYER_TEST_PYTHON="/absolute/working/python" npm --prefix dashboard test
"/absolute/working/python" scripts/verify-agent-integrations.py --run
make check-agents
"/absolute/working/python" scripts/package-performance-evidence.py /absolute/performance-evidence
```

To repeat **all** tests with local PG, pass all `tests.test_*` module names to the disposable launcher, as recorded in the local command log. It creates/stops its own credential-free cluster and UUID schemas and disables inherited provider environment loading. Field INP, natural production cold starts, dispatch attribution, actual database/provider geography and real Android remain explicitly unverified.
