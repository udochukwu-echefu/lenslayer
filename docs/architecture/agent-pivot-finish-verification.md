# Agent infrastructure finish verification

Completed 9 October 2026. Developer infrastructure and the bounded LensLayer-hosted
task service are implemented, reviewed and integrated. Staging and SDK artifacts
are prepared for review. This is local execution evidence: no cloud deployment,
npm publication, live OIDC/Google flow or real product-model request was performed.

## Delivered outcome

- Owners/admins assign document follow-ups, Calendar-only events or combined
  goals through `/agent-tasks` and the human hosted-task API. Exact source,
  assignee, dates and Calendar target/facts are supplied explicitly.
- Python planning persists in database checkpoints with tenant idempotency,
  compare-and-swap leases, stable run/evidence/proposal identities and restart
  recovery. Internal delegation expires at the assignment deadline; the browser
  receives no usable agent bearer. Human approval remains mandatory.
- Success requires every named action's existing server-verified receipt.
  Combined tasks show partial progress; cancellation/unknown outcomes preserve
  effect history and never imply reversal or another blind provider write.
- The dedicated `--agents-only` worker advances planning and approved actions
  independently of document review/email processing. Worker health recognizes the
  agent lane. Additive migration `ab3d5e7f9012` preserves historical owner/lane
  defaults and the external v1 action hash/approval contract.
- Deterministic execution requires no product model. Optional model decisions
  are limited to proceed/confirmation/decline, durably charged once, separately
  configured as `gpt-6.1-sol` / high, and cannot synthesize action facts or grant
  permission. API compatibility and real-model quality remain unverified.
- Hosted pages provide private role-aware assignment/status, explicit model data
  disclosure, ambiguous-request replay, cancellation warnings and existing Runs
  approval/input/receipt links. Public preview stays synthetic and read-only.
- Isolated staging manifest, build-only image configuration, pinned secret/digest
  references, disabled continuous worker plan and Cloudflare staging configuration
  are prepared. A manual SDK artifact-review workflow packs without publishing.

Existing developer SDK, official local stdio MCP, external-client example,
evidence/approval ledgers, encrypted Calendar consent/recovery and task-only
TypeScript reference CLI remain supported. The CLI is separate from the new
database-backed Python hosted service.

## Combined independent verification

**493 distinct tests passed.** Repeat runs, subtests, build checks and HTTP flows
are not added to this count. The full backend run enabled disposable PostgreSQL
17 with explicit opt-in and isolated UUID schemas; no PostgreSQL tests skipped.

| Check | Actual result |
| --- | --- |
| Backend discovery | 226 passed, including 78 PostgreSQL and six staging-plan tests |
| SQLite/PostgreSQL migrations | Upgrade/downgrade/re-upgrade, historical rows/constraints and full metadata drift checks passed |
| SDK | 33 passed; packed allowlist/credential-pattern checks, clean installed ESM and TypeScript declarations passed |
| Official MCP client | Four passed, including actual local stdio transport |
| Reference task planner | 22 injected evaluations passed |
| External examples | 14 passed |
| Dashboard | 194 passed in 27 files; lint passed |
| Default dashboard compilation | Next.js 16.2.11 Turbopack production build passed; 28 static pages |
| Cloudflare staging build | OpenNext build completed with `.open-next/worker.js` |
| Staging deploy dry-run | Wrangler completed, 74 assets, 2,260.77 KiB compressed upload; no deployment |
| Landing/report evaluation | Preceding unchanged landing phase passed lint/Vite and deterministic report quality gate |

The default dashboard build ran in the dependency-complete isolated experience
directory. Root independently verified the combined backend, clients, HTTP flows,
dashboard tests/lint and OpenNext/dry-run. Runtime source was copied byte-for-byte
from that checked combined candidate; later edits affected documentation,
package provenance and build-context exclusions. The six staging-plan tests were
rechecked after the final exclusions. GitHub Actions definitions were parsed;
no hosted CI run is claimed.

### Actual HTTP/API/worker checks

The disposable nonce-verified loopback runner passed the existing SDK/example/MCP
task approval/read-back/replay, planner restart, Calendar-only input, document
task/event composite, and uncertain-write GET-only recovery flows. It also passed:

1. Hosted retained-document follow-up, fresh worker processes at checkpoints,
   human approval, exact database receipt and replay of the original run.
2. Hosted Calendar-only event without document/assignee scope, exact approval,
   one injected provider POST and matching GET receipt.
3. Hosted combined goal with both immutable proposals: approve the task first,
   persist partial completion with no event/success, then approve the event and
   require both verified receipts.
4. Queued cancellation with no effect, disabled-model rejection, exact tenant
   idempotent replay/conflict, no browser token and no duplicate tasks/events.

API, database, retained source, SDK/MCP, human approval and worker processes were
real local components. Only provider/model HTTP was injected. No real `.env` was
loaded by the fixture. Its processes/data were cleaned up. Backend tests cover
concurrent claims, stale final lease fences, authority/source/deadline changes,
transaction rollback, crash after model charge, bounded waits and denied roles.

### Browser evidence and limits

OpenCode's final browser smoke inspected synthetic hosted assignment in light/dark
at 320/375/768/1440px and detail at 320/1440px. It reported no horizontal/input
overflow, assignment writes or runtime errors; representative screenshots were
reviewed. Component tests include model disclosure, role denial, cancellation,
late-response/scope guards and focused axe coverage. Private real OIDC browser,
full keyboard/reduced-motion and accessibility acceptance remain staging work.
The inherited global Ask AI floater can overlap mobile helper text; staging
should include scroll/keyboard interaction around the floating control.

Ambiguous submission intent is retained in memory and reused across retries,
including a failed list refresh. Reload/scope switch does not restore it; inspect
history before reassigning. The list shows the latest 50 assignments without
pagination. These limits do not imply server rejection or duplicate prevention
for a newly invented assignment key.

## Review artifacts and coordination

The coordinator compared starting original-file hashes and final isolated/combined
hashes before integrating **62 owned deltas** (24 platform, 38 experience). Original
dirty work was preserved. No reset, staging, commit, publication or deployment was
performed. The staging source fingerprint covers the final integrated source.

OpenCode used GPT-6.1 Sol high for both tracks; Astra was not used. One brief Codex
Sol high recovery helper contributed UI guards/tests during an OpenCode transport
outage and was stopped when the user clarified the OpenCode preference. The final
UI review/build/browser pass returned to OpenCode. Saved-account quota monitoring
did not observe a five-hour exhaustion and no account switch was triggered.
Development subscriptions were never reused as product credentials.

The exact 18-file SDK review artifact is
`/private/tmp/lenslayer-sdk-release-review/lenslayer-agent-sdk-0.1.0.tgz`; `pack.json`
and `SHA256SUMS` are beside it. SHA-256:
`4bf4cd4ce01dadfe485c63f798724c22bad7fd50241fbd96035d844ab392ffaa`.
Canonical repository/bugs/homepage metadata was verified. The package remains
`UNLICENSED`, local and unpublished; scope ownership/distribution terms and trusted
publication still require the release owner.

Historical isolated handoffs: [platform finish](agent-platform-finish-result.md),
[experience finish](agent-experience-finish-result.md). The earlier
[385-test developer-pilot record](agent-pivot-integration-verification.md) is
superseded for current status by this report.

## Remaining release steps

1. Provision separate empty staging PostgreSQL, private R2, runtime identity,
   OIDC audience/client and seven staging secrets. Review/execute the prepared
   immutable-image migration/API/dashboard/worker plan; activate the continuous
   worker explicitly. Names-only inspection found production resources/secrets,
   not staging readiness.
2. Complete real staging OIDC role/tenant switching, supervised worker
   concurrency/restarts, health/metrics/alerts and private browser acceptance.
3. Configure a Google sandbox and verify live same-human consent, one approved
   disposable event, exact GET receipt, refresh/disconnect and query-log handling.
4. If enabling the optional model, provision separate product API access and
   approved excerpt handling/costs; test actual API compatibility and quality.
   Initial staging keeps model mode disabled.
5. Resolve npm scope/license/publishing authority, run trusted release CI and
   publish only when authorized; configure a real approved MCP host.

Broader goals, additional live connectors, arbitrary tool extensibility and general
DAGs are future product scope, not claims of this bounded release. See the
[release checklist](../developer-release-checklist.md),
[hosted API](hosted-agent-api.md), [hosted operations](../deployment/hosted-agent-service.md)
and [staging review](../deployment/agent-staging-review.md).
