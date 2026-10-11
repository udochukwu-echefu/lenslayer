# Experience finish result

> Historical isolated OpenCode handoff. The coordinator subsequently integrated and independently verified the combined source; see [current finish verification](agent-pivot-finish-verification.md).
> This final review ran in OpenCode; a brief Codex Sol high recovery helper had contributed some earlier UI guards/tests before being stopped.

2026-10-09 · isolated snapshot `/private/tmp/lenslayer-pivot-qvfsf4lf/experience` · OpenCode GPT-6.1 Sol/high only.

## Outcome

Local finish gates pass. Reviewed the already-implemented hosted assignment/status experience against `finish-contract.md`, including the recovery helper's model-sharing disclosure, Calendar capability guard and cancellation/stale-response tests. No hosted-task source correction was needed. This pass created only `finish-result.md`; existing source edits were preserved. No original checkout access, real env inspection, deployment/publication, live-account changes, provider/model requests or subagents.

The UI supports document, Calendar-only and combined goals; private owner/admin access; explicitly synthetic read-only preview; exact retained-source/member/original Calendar grant selection; aware timestamps; fixed human-authored facts; frozen ambiguous-submit key/request; scope-switch abort/drop guards; capability-controlled model consent; cancellation warnings; and links to existing Runs approval/input/verified receipts. `lenslayer_hosted_agent` ownership is distinct from planning method and external credentials.

## Verified evidence

All commands used explicit snapshot workdirs and exited successfully:

| Workdir | Command | Result |
| --- | --- | --- |
| `dashboard/` | `npm test` | **194 tests / 27 files passed**, including hosted assignment/API/status/access/cancellation and axe coverage |
| `dashboard/` | `npm run lint` | Passed, no lint diagnostics |
| `dashboard/` | `npm run build` | **Default Next.js 16.2.11 Turbopack production build passed**; compilation 3.1s, TypeScript 5.4s, 28/28 static pages; `/agent-tasks`, `/agent-tasks/[taskId]`, `/developers`, Runs and OAuth-return routes present |
| `dashboard/` | `node scripts/verify-hosted-ui.mjs` | Passed: synthetic composite form in light/dark at 320/375/768/1440px, detail at 320/1440px, model disclosure, no horizontal/input overflow, **zero assignment writes / runtime errors** |
| `hosted-agent/` | `./node_modules/.bin/tsc -p tsconfig.json` | Reference planner compiled; used existing SDK build, did not invoke script that rebuilds out-of-scope SDK |
| `hosted-agent/` | `TMPDIR=/private/tmp/lenslayer-pivot-qvfsf4lf/experience/hosted-agent node --test tests/*.test.mjs` | **22 passed**, injected transport/planner only; on-disk test data confined to snapshot and cleaned up |
| snapshot root | `git diff --check -- dashboard hosted-agent docs/developer-agent-quickstart.md` | Passed |

Before rebuilding, process inspection found no active Next build; prior `.next` had BUILD_ID/manifests but static-generation diagnostics alone were not treated as exit evidence. No lock was deleted and no conflicting build was started. Browser smoke terminated its owned server/browser and removed its disposable profile. Screenshots and measurements are in ignored `dashboard/.hosted-ui-qa/` (`result.json`, `assignment-{light,dark}-{320,375,768,1440}.png`, `detail-{320,1440}.png`). Representative mobile/light, desktop/dark and mobile-detail screenshots were visually reviewed.

## Exact finish-feature files reviewed (existing, not newly authored here)

- Routes: `dashboard/src/app/agent-tasks/page.tsx`, `dashboard/src/app/agent-tasks/[taskId]/page.tsx`.
- Hosted UI: `dashboard/src/components/agents/hosted-task-access.tsx`, `dashboard/src/components/agents/hosted-task-form.tsx`, `dashboard/src/components/agents/hosted-task-list.tsx`, `dashboard/src/components/agents/hosted-task-detail.tsx`, `dashboard/src/components/agents/hosted-task-status.tsx`, `dashboard/src/components/agents/hosted-tasks.css`, `dashboard/src/components/agents/hosted-tasks.test.tsx`.
- Wire/facts/state/tests: `dashboard/src/lib/api/hosted-agents.ts`, `dashboard/src/lib/hosted-agent-types.ts`, `dashboard/src/lib/hosted-agent-assignment.ts`, `dashboard/src/lib/hosted-agent-state.ts`, `dashboard/src/lib/hosted-agent-api.test.ts`, `dashboard/src/lib/hosted-agent-assignment.test.ts`, `dashboard/src/test/hosted-fixtures.ts`.
- Transport/private scope: `dashboard/src/lib/api.ts`, `dashboard/src/lib/api/client.ts`, `dashboard/src/lib/api/contracts.ts`, `dashboard/src/lib/api/workspace.ts`, `dashboard/src/lib/api/integrations.ts`.
- Navigation/run ownership: `dashboard/src/components/app-shell.tsx`, `dashboard/src/components/agents/agent-registry.tsx`, `dashboard/src/components/agents/run-list.tsx`, `dashboard/src/components/agents/run-detail.tsx`, `dashboard/src/lib/agent-types.ts`, `dashboard/src/lib/agent-state.ts`, `dashboard/src/components/ui/status-badge.tsx`, `dashboard/src/components/agents/run-list.test.tsx`, `dashboard/src/components/agents/run-detail.test.tsx`.
- Guide/verification/config: `dashboard/src/app/developers/page.tsx`, `dashboard/src/components/agents/developer-guide.tsx`, `dashboard/src/components/agents/developer-guide.test.tsx`, `dashboard/scripts/verify-hosted-ui.mjs`, `dashboard/README.md`, `dashboard/.gitignore`, `dashboard/next.config.ts`, `dashboard/wrangler.jsonc`, `docs/developer-agent-quickstart.md`, `hosted-agent/README.md`.
- Reference CLI compiled/tested without source changes: `hosted-agent/src/runner.ts`, `hosted-agent/src/checkpoint.ts`, `hosted-agent/src/model.ts`, `hosted-agent/src/cli.ts`, `hosted-agent/src/contracts.ts`, `hosted-agent/tests/evaluations.test.mjs`, `hosted-agent/package.json`, `hosted-agent/tsconfig.json`.

Other inherited snapshot changes, including Calendar/operator experience and backend/SDK/coordinator-owned files, remain intact; this list is the finish-feature review inventory, not an attribution of the entire snapshot diff. No SDK/types or backend files were changed by this pass.

## Contract deviations and known limits

- **No hosted wire-name/schema deviation found.** Human API uses exact organization routes, `assignee_id`, strict goal-specific payloads and bodyless cancellation; no browser agent credential provisioning. Frontend consent is a local submit guard, not an invented backend field. Backend enforcement/persistence is not proven by mocked UI tests.
- UI intentionally requires an explicit phrase/title and selects the latest retained source rather than exposing optional `version_id` or relying on API defaults. Calendar filtering additionally requires the existing `google_calendar.events.create` capability and encrypted connection mode. These are narrower UI choices, not schema extensions.
- Idempotency intent is in-memory only, survives failed list refresh, and is not recoverable after reload/scope switch. Inspect history before reassignment; abort does not prove server rejection. Lists show up to 50 records without pagination. Automatic status polling stops at terminal state or deadline; Refresh remains available.
- The reference TypeScript CLI remains task-only and uses local file checkpoints; it is **not** the new durable Python hosted service. Its fake-fetch tests are not model-quality, provider or hosted-worker durability evidence.
- The inherited global Ask AI floater can overlap a small patch of mobile helper text in full-page screenshots. No hosted form overflow was found; global shell behavior was left unchanged. Staging should include keyboard/scroll interaction and real-session checks.
- Existing `dashboard/wrangler.jsonc` already disables automatic invocation URL logs (`observability.logs.invocation_logs=false`), as the coordinator note permits; this pass did not change it. Coordinator must independently verify staging/reverse-proxy/Tail/Logpush/tracing/custom logs before real OAuth. Browser query clearing is insufficient by itself.
- **Root/platform release gates remain:** actual hosted HTTP/backend integration, role/tenant authority, idempotency replay/conflict, durable restart/claim/lease/cancellation/deadline behavior, dedicated worker lane, PostgreSQL concurrency, staging review and live OAuth/provider/model validation. No staging, Cloudflare/OpenNext build, deployment, npm publication or live provider execution is claimed here.
