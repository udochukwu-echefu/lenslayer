# Developer/product release checklist

Developer infrastructure and the bounded user-assigned hosted service are
implemented and independently checked. Staging and SDK artifacts are prepared for
review; **nothing was published, deployed or verified against live providers/models**.
Unchecked items are release verification or subsequent product work. Current
combined evidence is in [finish verification](architecture/agent-pivot-finish-verification.md);
the earlier [integration record](architecture/agent-pivot-integration-verification.md)
is historical.

## Local checks completed

- [x] Dependency-free server-only SDK 0.1.0 builds; 33 tests pass.
- [x] `npm --prefix sdk run release:check`: 18-file pack allowlist, credential
  pattern scan, packed artifact installation, ESM import and TypeScript smoke.
- [x] Official MCP SDK 2.3.1 is pinned with a lockfile; four official-client wire
  tests pass, including real stdio, modern discovery, exact additive routes,
  narrowed calendar-only discovery and typed input lifecycle.
- [x] Task-only planner CLI/adapter build; 22 deterministic injected evaluations.
- [x] External task example: 14 tests.
- [x] Dashboard lint, 194 tests in 27 files and default Next.js production build;
  landing `check` and build from the preceding unchanged landing phase.
- [x] Disposable original-v1 HTTP/SQLite/worker checks: example, SDK approval,
  replay/pagination/revocation, real stdio MCP approval/read-back, planner on-disk
  restart with original evidence/action and no duplicate tasks.
- [x] Input history fetched for every run, waiting-only/deadline-bounded polling,
  post-supply refresh, fresh terminal history and immutable-condition guidance.
- [x] Combined backend: 226 tests, including 78 opted-in PostgreSQL checks;
  SQLite/PostgreSQL migration round trips and metadata drift checks pass.
- [x] Combined real HTTP/worker checks for calendar-only, document-backed composite,
  human/agent input, partial progress and unknown-effect GET-only recovery;
  fake provider only, no second insert.
- [x] Calendar Settings/return UI, same-human session binding, query clearing,
  one-time exchange, actor/workspace-change cancellation and pending revocation.
- [x] Python hosted service and assignment/status UI for document follow-up,
  Calendar-only and combined goals; owner/admin human API, exact fixed facts,
  internal delegation, durable checkpoints, lease fences and verified receipts.
- [x] Hosted API/worker HTTP flows against disposable databases, restart/replay,
  distinct approvals, partial composite completion, cancellation and disabled model.
- [x] Dedicated `--agents-only` lane, compatible execution ownership defaults,
  PostgreSQL hosted claims/concurrency and additive migration/drift checks.
- [x] Six nonmutating staging-plan tests; isolated manifest/configuration,
  build-only image pipeline, pinned versions/digest gate and disabled worker pool.
- [x] OpenNext Cloudflare staging build and Wrangler deployment dry-run; 74 assets,
  no publication. Names-only Google inventory identifies missing staging secrets.
- [x] No self-approval, submitted-code execution, credential/excerpt checkpoints,
  real provider/model writes, npm publishing or deployment in this assignment.

Commands/setup: [quickstart](developer-agent-quickstart.md),
[`sdk/README.md`](../sdk/README.md), [`mcp/README.md`](../mcp/README.md),
[`hosted-agent/README.md`](../hosted-agent/README.md).

## SDK distribution and provenance — release owner

- [ ] Confirm copyright ownership and lawful distribution/use terms. This package
  is `UNLICENSED` / all rights reserved; do not call it open source. If an approved
  license is chosen, update package metadata, LICENSE, README and release checks
  together. `private` was removed to allow packaging, not to authorize publication.
- [ ] Verify control of the `@lenslayer` npm scope, intended package visibility,
  maintainer identities, package version, access policy and MFA/trusted publishing.
- [x] Confirm public canonical repository `udochukwu-echefu/lenslayer` and set
  actual repository/bugs/homepage metadata. No npm release is implied.
- [x] Inspect the exact 18-file allowlist and tarball metadata/content; record
  SHA-256 and npm integrity in a private review bundle. Automated credential
  patterns are a guardrail, not a complete secret scanner.
- [x] Install a checked packed artifact in a clean local Node client; ESM/types
  smoke and 33 tests include abort/timeout/idempotency. Document ESM-only support.
- [x] Add a manual artifact-review CI workflow that runs release checks, packs,
  records integrity and uploads the artifact without publishing. GitHub Actions
  execution itself remains unverified until the workflow is pushed/run.
- [ ] Establish trusted CI/OIDC publishing with provenance; review the repository
  release/tag/commit binding and dependency lockfile. Follow
  https://docs.npmjs.com/generating-provenance-statements.
- [ ] Only after explicit owner authorization, run the approved publish job with
  intended access and provenance. `prepublishOnly` runs local checks but is not
  legal approval or authorization. Verify registry artifact/integrity afterwards.
- [ ] Only then change local-install docs/CTAs to claim an npm release is available.

## Merge and staging integration — coordinator/platform owner

- [x] Combine the additive platform and experience tracks and independently
  run the actual backend suite and original task SDK/MCP/planner HTTP flows.
  Review only owned deltas and preserve original uncommitted edits.
- [x] Repeat calendar-only, document-backed calendar and mixed `all` flows against
  the merged disposable backend/fake provider. Check exact target/condition/hash,
  one reserved action per condition, source/approval expiry, tenant boundaries,
  partial progress, and no silent success from one receipt.
- [x] Validate human and agent responders separately: strict field/value types,
  immutable replay/409, attribution, no values in events, supply after expiry,
  history on fresh failed/cancelled/succeeded pages and unchanged grants/deadline.
- [x] Validate unknown/partial effects and GET-only reconciliation, remaining
  attempt budget, cancelled-run fencing, and no second insert/compensation.
- [x] Review/integrate the hosted-service and assignment tracks; verify original
  source hashes before copying the 62 owned deltas. Preserve prior dirty edits.
- [x] Prepare [staging review](deployment/agent-staging-review.md) and non-secret
  commands/environment bundle without cloud mutation; keep model disabled and
  dedicated worker at zero instances until separately activated.
- [ ] Provision staging PostgreSQL/storage and run migrations through existing
  deployment process. Validate worker leases, locks, restart/crash behavior,
  queue retries, `/health/worker`, metrics, revocation backlog and alerting.
- [ ] Configure existing OIDC/session/proxy correctly; exercise owner/admin,
  reviewer/viewer, membership revocation and organization switching. Do not use
  local identity headers or synthetic data as proof of live browser identity.
- [x] Verify loopback landing `/developers` and `/runs` CTAs and the public
  signed-out guide/sample navigation.
- [ ] Configure actual deployed dashboard/landing URLs and test live sign-in.

## Google Calendar OAuth/provider — platform and UI owner

- [ ] Configure provider client ID/secret, exact redirect URI and encryption key
  through approved secrets. Obtain required OAuth consent/test-user approval and
  only the implemented `calendar.events.owned` scope; no unreviewed broader scope.
- [x] Implement/review Settings consent start and `/calendar/oauth-return`
  relay under the initiating human session; clear query, handle expiry/one-time
  failure, actor changes, interrupted exchange and explicit restart.
- [x] Configure Cloudflare automatic invocation URL-log suppression and disable
  staging traces; reviewed config passed the staging build/dry-run.
- [ ] Inspect deployed Tail/Logpush/proxy/custom logging and exercise the actual
  Google callback with the live private OIDC session; no third-party scripts.
- [ ] Test original owned-calendar grant and actual permission on dispatch. Active
  stored OAuth metadata is not proof of selected-calendar access or identity.
- [ ] Exercise live approved event write and exact GET read-back in a designated
  sandbox with explicit separate authorization. Check times, summary, description,
  private visibility, provenance, stable event ID, timeout/409 conflicts and no
  attendees/recurrence/arbitrary options. Never repeat an uncertain write.
- [ ] Verify refresh-token handling, credential/scope changes, disconnect's local
  blocking, pending provider revocation retry, and reconnect as a new connection.
- [ ] Review operational recovery/retention without implying deletion or rollback;
  no compensation API is implemented. Mark provider availability only after these
  checks and consent UI are complete.

## Local MCP host and optional planner model

- [ ] Configure an actual approved MCP host using
  `mcp/client-config.example.json`; direct absolute Node entrypoint, no npm stdout
  chatter, process-only scoped credentials, metadata-only stderr. Exercise legacy
  initialize/current discovery, revocation and missing/unsupported tool versions.
- [ ] Keep MCP local stdio unless a separately designed/authenticated/authorized
  remote service is implemented. Do not advertise remote MCP OAuth or hosted URLs.
- [ ] Approve separate product API access and costs; never use OpenCode subscription
  credentials. Explicitly opt in to `gpt-6.1-sol`, high effort, with no fallback.
  Development model selection does not prove this identifier is accepted by the
  product API; actual compatibility and credential access must be verified.
- [ ] Approve excerpt transfer/data processing and provider retention policy;
  `store:false` alone is not a zero-retention guarantee. Keep keys/config server-only.
- [ ] Run real-model evaluation separately: grounding, missing facts, adversarial
  source/tool output, refusals/truncation, literal span offsets, latency/cost and
  bounded retries. Injected evaluation establishes infrastructure safeguards, not
  model accuracy, legal reasoning or robustness to all prompt injection.
- [x] Keep the TypeScript reference CLI task-only with fixed action text. The
  separate Python hosted service implements three fixed-fact goals with shared
  checkpoints and decision-only model output. Changed facts/source need a new
  assignment/run; neither model can expand delegated authority.
- [ ] If independently hosting the reference CLI, review its private checkpoint
  directory, stale-lock recovery and process isolation. Its local file locking
  does not establish distributed concurrency safety or replace the Python service.

## Browser QA

- [x] Public landing at 1440px/320px and developer guide at 1440px/390px/320px;
  synthetic run detail and immutable JSON at 390px/320px. No document overflow
  or broken landing images in the inspected views.
- [x] SDK disclosure keyboard activation and mobile navigation Escape/focus;
  landing guide CTA and sample-run navigation; synthetic/read-only labels.
- [x] Callback clears the entire synthetic code/state URL and offers restart,
  with no completion button when initiating metadata/session is absent.
- [x] Hosted synthetic assignment/detail browser checks at 320–1440px in
  light/dark, model disclosure, no horizontal/input overflow and zero assignment
  writes/runtime errors; component tests include focused axe coverage.
- [ ] Complete private operator browser checks under staging OIDC: calendar/mixed
  conditions, input history after reload, expiry, unknown receipts and role changes.
  Automated local component/API checks cover these, not a live private browser.
- [ ] Complete full keyboard/reduced-motion and accessibility checks. The focused
  disclosure/menu interactions above are not a full accessibility audit.
- [ ] Reassess capability copy after publication/provider/hosting gates pass.

## Subsequent product work

- [x] Implement a user-facing LensLayer agent service with shared checkpoints,
  explicit task assignment and a dedicated supervised-worker deployment plan.
- [ ] Deploy it and complete real OIDC/worker/provider/model acceptance through
  the staging gates above. Local tests and prepared commands do not prove hosting.
- [ ] Add further customer-validated goal types and connectors. Hosted planning
  covers document/Calendar/combined fixed-fact goals; the registry is closed and
  workflows are bounded named `all` conditions rather than general DAGs.
