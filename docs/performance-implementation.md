# Performance implementation tracker

## Baseline and boundaries

- Remote `main`: `179cfb544e2a2802aa0c95cb330364913c75b045` (PR #10 merged).
- PR #11 was **open**, head `87ddff8c0d755ff32d02571d69d52651c6e701da`.
- PR #12 was **open**, head `a12076e270f1f74fc47b4dafb62061157bb6471d`.
- Local integration baseline: `18f851679478d0b63fc54526031e558095fcb16f`, combining those exact heads. This is **not remote main** and does not imply either pending PR was merged or deployed. Rebase/recheck performance PRs after the owner merges dependencies.
- The owner's dirty checkout and launch-video files are untouched. Implementation uses isolated worktrees; no production migrations, paid calls, deployment, warming, IAM/resource activation or merges are authorized.
- Prior audit scores are reported single-run lab evidence, not comparable baseline medians. Canonical application: `https://app.lenslayer.online`.

## Finding tracker

| Finding | Baseline evidence | Change / acceptance | Status |
| --- | --- | --- | --- |
| 1 Upload blocking | Original and independent fake-scanner loopback reproduction | Complete blocking unit/session ownership, bounded execution, synchronized concurrency/error tests | In progress |
| 2 Overfetching | Full shell lists, array-only APIs, local table slicing | Additive bounded query API, scoped search, aggregate summaries, caller migration, payload/tenant tests | In progress |
| 3 Landing delivery | Blocking font CSS, JPEG, initial reveals in PR #11 | Self-host fonts, responsive screenshot, immediate hero, repeated mobile samples and visual checks | In progress |
| 4 Private waterfall | Session coalescing/cache already exists; exact redundant stage needs measurement | Preserve fresh checks; isolate account caches; measure and remove proven waits | In progress |
| 5 Public startup | `/sample` already skips WorkspaceProvider | Split actual public providers/module/style ownership; repeated lab/network checks | In progress |
| 6 Collaboration N+1 | Independent 20 distinct-author comments → 24 SELECTs | Eager-load all serializer relationships; 1/20/100 distinct-user tests for all three lists | In progress |
| 7 Q&A | Complete model invocation, full portfolio source loading; limits not typical latencies | Bounded relevant candidates, safe timings, compatible streaming, cancellation/final-only audits | In progress |
| 8 Infrastructure | Minimum-zero/request-based workers; geography/cold starts not newly measured | Keep idle costs unchanged; reproducible timing/dispatch/PG procedures and justified code fixes only | Awaiting evidence |

## Independent-review corrections (binding)

1. Public sample does not mount WorkspaceProvider; page CSS coverage is not global deletion evidence.
2. Transport coalesces and caches session reads for 30 seconds; hosted operations' fresh policy stays. Private projection/hydration must be scoped, never universal/public/cacheable.
3. Existing array list contracts stay complete. New pagination is additive; search stays available without preloaded records. Aggregate counts are not page lengths.
4. Upload offloading must own its session and complete blocking unit, use bounded concurrency, and preserve scan-before-use and failure cleanup.
5. BFF already forwards response bodies. Streaming is an additive protocol, not an assumed buffering fix. Preserve partial/final distinction, cancellation and atomic actions.
6. Workers always remain minimum zero/request-based/bounded. API warming requires a separate owner decision. No region, production index, IAM, schedule or idle polling change is implied.

## Batch 2 API contract and caller inventory

Existing `/contracts`, `/tasks`, `/lifecycle` array routes and SDK behavior remain unchanged. Additive `/query/{contracts,tasks,lifecycle}` routes return `{items,total,offset,limit}`. Page limit 1–100; stable field + unique-ID ordering; authorized filters precede pagination. Offset pages are live views, not a cross-request immutable snapshot: concurrent edits can change totals/positions. Empty/out-of-range pages return truthful totals and empty items, and clients can restart paging. No silent truncation of legacy arrays.

`/query/overview` returns SQL aggregate totals and bounded previews. `/query/search?q=…` returns a bounded union of safe contract/task navigation results, not retained source text. All query endpoints preserve membership checks and private no-store BFF behavior. Scope/filter/page are part of query keys and requests receive AbortSignals.

Callers inventoried: shell global search; overview; contracts; tasks; inbox; calendar; portfolio; contract detail tasks; contract lifecycle; task composer contract selection; agent-create contract scope; hosted-task form contract scope. Legacy array use is preserved for external/SDK compatibility while dashboard callers are migrated or explicitly scoped. Independent startup/Q&A changes must not reintroduce shell downloads.

## Evidence storage

Raw local measurements: `/private/var/folders/th/p6pw8fpd5492qwl6c3dp9wpc0000gn/T/opencode/performance-evidence/`.
Only synthetic, sanitized artifacts may be retained. Record source/build SHA, commands/tool versions, viewport, throttling/cache state, medians and ranges; separate transfer from decoded bytes. Do not claim field INP, real Android or production cold-start results from local fixtures.
