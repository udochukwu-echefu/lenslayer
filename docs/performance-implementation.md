# Performance implementation tracker

## Baseline and boundaries

- Initial remote `main`: `179cfb544e2a2802aa0c95cb330364913c75b045` (PR #10 merged).
- Initial dependency snapshot: `18f851679478d0b63fc54526031e558095fcb16f`, combining #11 head `87ddff8c0d755ff32d02571d69d52651c6e701da` and #12 head `a12076e270f1f74fc47b4dafb62061157bb6471d` while both were open.
- Fresh fetch confirmed #11/#12 **merged**, with current main `e16c4711eb1220c438aae4e74138a3da5581e392`. `git diff 18f851679 origin/main --exit-code` is empty: identical baseline bytes, different history. Performance branches incorporate actual main; #13/#14 are retargeted to main and #16 explicitly depends on #15. No performance PR was merged or deployed.
- The owner's dirty checkout and launch-video files are untouched. Implementation uses isolated worktrees; no production migrations, paid calls, deployment, warming, IAM/resource activation or merges are authorized.
- Prior audit scores are reported single-run lab evidence, not comparable baseline medians. Canonical application: `https://app.lenslayer.online`.

## Finding tracker

| Finding | Baseline evidence | Change / acceptance | Status |
| --- | --- | --- | --- |
| 1 Upload blocking | Independent fake 1s scan: unrelated health stalled 1020.88ms | [#14](https://github.com/udochukwu-echefu/lenslayer/pull/14), `backend/app/api/uploads.py`; owned sessions, bound four, synchronized scan/storage/cancellation tests; unchanged reproduction now 1.48ms | Implemented/verified locally |
| 2 Overfetching | Full shell arrays and local slicing | [#15](https://github.com/udochukwu-echefu/lenslayer/pull/15), [#16](https://github.com/udochukwu-echefu/lenslayer/pull/16); additive bounded queries/search/SQL aggregates; 1000-row fixture and disposable PostgreSQL; legacy arrays complete; UTC and half-open dates corrected | Implemented/verified locally |
| 3 Landing delivery | Blocking external font CSS, JPEG, initial reveals | [#17](https://github.com/udochukwu-echefu/lenslayer/pull/17); existing licensed fonts, responsive images, eager hero; three mobile runs and 80 visual/interaction checks | Implemented/verified in lab |
| 4 Private waterfall | Session reads already coalesced/cached; browser session → metadata → records chain reproduced | [#18](https://github.com/udochukwu-echefu/lenslayer/pull/18); private safe projection, parallel metadata, account caches, unchanged fresh/BFF checks; read-only refresh rotation fixed. Trace/latency tradeoffs in `performance-results.md` | Implemented; production benefit awaits measurement |
| 5 Public startup | `/sample` already skipped WorkspaceProvider but fetched session and shared universal CSS/modules | #18; public route providers/styles split without deleting workspace rules; generated-style regression check; final public lab reports and phone/desktop light/dark comparisons | Implemented/verified in lab |
| 6 Collaboration N+1 | 20 distinct-author comments: 24 SELECTs | [#13](https://github.com/udochukwu-echefu/lenslayer/pull/13); comments/decisions/approvals now 4/4/4 SELECTs at 1/20/100 records; independent reproduction now 4 | Implemented/verified locally |
| 7 Q&A | Full portfolio source materialization; complete JSON generation; timeout/token values were limits, not latency | [#19](https://github.com/udochukwu-echefu/lenslayer/pull/19); SQL relevance before 24-candidate materialization; older-source tests; safe timings and additive NDJSON; contract/portfolio/assistant cancellation/final-only completion; Groq QA only | Implemented/verified with fake providers |
| 8 Infrastructure | No attributed cold-start/dispatch/provider/DB-region traces | [#20](https://github.com/udochukwu-echefu/lenslayer/pull/20): bounded recovery of demonstrated final-attempt crash defect; concurrency/retention/idle tests in SQLite and PostgreSQL; read-only PG plans retained, no DDL justified | Code defect fixed; external attribution awaits owner measurements |

## Independent-review corrections (binding)

1. Public sample does not mount WorkspaceProvider; page CSS coverage is not global deletion evidence.
2. Transport coalesces and caches session reads for 30 seconds; hosted operations' fresh policy stays. Private projection/hydration must be scoped, never universal/public/cacheable.
3. Existing array list contracts stay complete. New pagination is additive; search stays available without preloaded records. Aggregate counts are not page lengths.
4. Upload offloading must own its session and complete blocking unit, use bounded concurrency, and preserve scan-before-use and failure cleanup.
5. BFF already forwards response bodies. Streaming is an additive protocol, not an assumed buffering fix. Preserve partial/final distinction, cancellation and atomic actions.
6. Workers always remain minimum zero/request-based/bounded. API warming requires a separate owner decision. No region, production index, IAM, schedule or idle polling change is implied.

All six corrections are applied, not merely acknowledged: public traces show no unnecessary auth requests, fresh-session/CSRF tests still pass, legacy arrays remain complete, owned upload cancellation is synchronized, NDJSON is additive to the already-streaming BFF, and no idle infrastructure is activated. See `performance-results.md` and `performance-rollout.md` for evidence, risks and owner-only steps. Constituent PRs are review slices; the combined-review PR contains resolved overlaps plus cross-batch regressions/evidence. Choose one merge strategy, not both.

## Batch 2 API contract and caller inventory

Existing `/contracts`, `/tasks`, `/lifecycle` array routes and SDK behavior remain unchanged. Additive `/query/{contracts,tasks,lifecycle}` routes return `{items,total,offset,limit}`. Page limit 1–100; stable field + unique-ID ordering; authorized filters precede pagination. Offset pages are live views, not a cross-request immutable snapshot: concurrent edits can change totals/positions. Empty/out-of-range pages return truthful totals and empty items, and clients can restart paging. No silent truncation of legacy arrays.

`/query/overview` returns SQL aggregate totals and bounded previews. `/query/search?q=…` returns a bounded union of safe contract/task navigation results, not retained source text. All query endpoints preserve membership checks and private no-store BFF behavior. Scope/filter/page are part of query keys and requests receive AbortSignals.

Callers inventoried: shell global search; overview; contracts; tasks; inbox; calendar; portfolio; contract detail tasks; contract lifecycle; task composer contract selection; agent-create contract scope; hosted-task form contract scope. Legacy array use is preserved for external/SDK compatibility while dashboard callers are migrated or explicitly scoped. Independent startup/Q&A changes must not reintroduce shell downloads.

## Evidence storage

Raw local measurements: `/private/var/folders/th/p6pw8fpd5492qwl6c3dp9wpc0000gn/T/opencode/performance-evidence/`.
Only synthetic, sanitized artifacts may be retained. Record source/build SHA, commands/tool versions, viewport, throttling/cache state, medians and ranges; separate transfer from decoded bytes. Do not claim field INP, real Android or production cold-start results from local fixtures.
