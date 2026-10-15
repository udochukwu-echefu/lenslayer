# Developer/product release checklist

Updated 15 October 2026 from saved acceptance/operator evidence, not new live checks.
Developer infrastructure and the bounded hosted service
are implemented, including private context, dependency/conditional/scheduled graphs,
trusted Calendar sessions and a durable default-zero model allowance. PRs 1–4 are
merged. **Bounded staging graph, one paid product canary and the original Calendar
consent/event/refresh/revocation are complete; production and publication are not.**
Workers use private request-driven CPU, service/revision min 0, max 1, concurrency
1; minimum-zero configuration is not a measured instance count. Staging/production
queues and recovery stay paused. Both staging hosted models are disabled, limit 0,
with no hosted-model key binding. Scanner/email/document-analysis used synthetic
data. Ten live DeepSeek evaluations and the single canary reserved US$3.4873356
of the original US$5; do not refund/reset or infer another paid-call authorization.
Current test counts and
all five release gates are in the [14 October acceptance record](architecture/agent-roadmap-acceptance-2026-10-14.md).
Live evidence from the earlier rollout is in the
[staging execution report](deployment/agent-staging-execution.md); local combined
evidence is in [finish verification](architecture/agent-pivot-finish-verification.md);
the earlier [integration record](architecture/agent-pivot-integration-verification.md)
is historical.

Saved [final handoff](../operator-evidence/FINAL-SOURCE-CI-HANDOFF.json) records
`c926f1968bbffc48d27c1231554acf40a9aa9472` with successful CI
`38729026621` at 11:56 UTC, draft/unmerged PR #5 and no publication. This does not
qualify these newer local edits or bind the deployed backend to that head. The
staging backend remains source `59320f31…` / image `b5888edb…`; Calendar dashboard
source `e26d3769…` has its own CI/deployment evidence. Root subsequently reports
main protection explicitly approved/applied, **not** a merge or release approval.
Root also reconfirms unchanged production API `lenslayer-api-00007-2jm`, schema
`6b1d3e8f2c57`, PostgreSQL **18.6**; staging schema `bf84e2c19a67` used PostgreSQL
**17.11**. The previously absent production revision has now been recovered from
original source, unchanged, and joined to the unchanged staging history by
candidate merge **`c7a4e9d2b630`**. Synthetic SQLite/local PG17.11 tests cover both
starting states and fresh DBs; **no PG18.6 recovery-clone migration has run**.
Root reports the approved one-day same-project snapshot `br-cold-credit-b11o29gv`
matches production in the **16:37:29 UTC read-only full readback**: all33 table
values via salted server-side SHA-256, columns/defaults, 223 indexes and470
constraints; both remain PG18.6/schema6b1 with literal true email default.
This supersedes earlier count/PK-only evidence, not migration acceptance or
production activation. This agent performed no live reads. See the
[candidate migration review](deployment/production-migration-lineage.md) and
[production preflight](deployment/production-release-preflight.md).

The compatibility candidate changes backend source (legacy fields, email opt-out
and signed-webhook behavior); it is **not deployed**, and the old `59320f31…` image/
413-test evidence must not be attributed to it. Its focused source-bound results
were originally in `MIGRATION-RESULT.md`. Final integration adds reviewed webhook
attempt fencing, historical-default validation and retention exception fencing;
**66 offline +21 disposable local PG17.11 tests passed** on the combined bytes.
See `CODE-COMPLETE.md` and its current-byte manifest. Historical migration34+5 and
retention31+12 logs remain unchanged, not substituted for these new results.
Canonical CI (root-reported PG18.6/Node24.15 plus91 operator checks), final image
and approved-clone migration/runtime qualification remain separate owner gates.

## Original local checks completed

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
  real provider/model writes, npm publishing or deployment in the original local
  verification phase. Subsequent approved staging execution is recorded separately.

Commands/setup: [quickstart](developer-agent-quickstart.md),
[`sdk/README.md`](../sdk/README.md), [`mcp/README.md`](../mcp/README.md),
[`hosted-agent/README.md`](../hosted-agent/README.md).

## SDK distribution and provenance — release owner

- [x] Apply the user's MIT choice to the SDK alone: canonical license, metadata,
  lockfile, README and packed-package checks agree. The MCP/backend are not
  relicensed. See [distribution setup](../sdk/DISTRIBUTION.md) for the reviewed
  artifact and owner-controlled publication procedure.
- [x] Owner reports free `@lenslayer` organization exists (2026-10-15), owner
  `udochukwuchibueze`, one member, zero packages. Not re-queried by source audit.
- [x] Owner npm MFA is enabled according to the saved acceptance record. This is
  not evidence of a live MFA publication or registry signature.
- [ ] Verify intended public visibility/version/access policy and configure
  package-specific trusted publishing after the approved first-package bootstrap.
- [ ] Review/merge draft PR #5 to canonical main, independently review its exact
  CI artifact, and approve a supported first-package bootstrap plan. The current
  direct-OIDC path is not a zero-package bootstrap; OIDC publishing needs npm
  >=11.15. The reviewed alternative is owner publication of the original reviewed
  tarball plus its real verified detached bundle, not repacking or token fallback.
- [x] Confirm public canonical repository `udochukwu-echefu/lenslayer` and set
  actual repository/bugs/homepage metadata. No npm release is implied.
- [x] Inspect the exact 18-file allowlist and tarball metadata/content; record
  SHA-256 and npm integrity in a private review bundle. Automated credential
  patterns are a guardrail, not a complete secret scanner.
- [x] Install a checked packed artifact in a clean local Node client; ESM/types
  smoke and SDK tests cover abort/timeout/idempotency. Document ESM-only support.
- [x] Integrated SDK handoff: 79 offline tests, eight independent adversarial
  cases and actual 18-file pack/consumer check on exact Sigstore 4.1.1; saved SDK
  all-class audit has zero vulnerabilities. These are not live signing proofs.
- [x] Saved acceptance records main-only `sdk-npm`, administrator bypass false,
  and publish-enable flag absent/off. Root reports main protection now applied.
- [x] Add a manual artifact-review CI workflow that runs release checks, packs,
  records integrity and uploads the artifact without publishing. GitHub Actions
  execution of this dedicated manual artifact-review workflow remains unverified;
  the feature test workflow has run successfully.
- [ ] Establish trusted CI/OIDC publishing with provenance; review the repository
  release/tag/commit binding and dependency lockfile. Follow
  https://docs.npmjs.com/generating-provenance-statements.
- [ ] Only after explicit owner authorization, run the approved publish job with
  intended access and provenance. `prepublishOnly` runs local checks but is not
  legal approval or authorization. Verify real registry bytes/integrity and retain
  successful `npm audit signatures` crypto/provenance evidence afterwards; an
  advertised attestation or synthetic test is not acceptance.
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
- [x] Provision independent empty staging PostgreSQL/private storage and apply
  migrations; live drift/pooled checks, retained synthetic upload/review, agent
  readiness, worker restart persistence, approval and exact receipts passed.
- [x] Configure real staging OIDC/session/proxy; establish the signed-in Google
  identity, owner assignment/approval, viewer UI restrictions and scoped contract
  lookup after organization switching. No local identity headers were used.
- [x] Verify live SDK/MCP scope boundaries, immutable replay/409, cancellation,
  credential revocation and zero duplicate tasks; return the worker to zero
  instances and confirm all review jobs finished **in the original document-task
  rollout**. This is historical, not the final graph's missing pre-expiry SDK
  denial or a fresh instance-count observation.
- [x] Ten monitoring policies enabled (five per environment); actual owner receipt
  of the staging ledger-attention alert is narrowly proved. Other policy paths,
  production delivery and incident auto-closure are not established by that email.
- [ ] Before sustained production operation, finish other monitoring/alert paths,
  live crash/queue-retry rehearsal as required, and remaining admin/reviewer/
  membership-revocation checks. Local PostgreSQL tests cover leases, locks and
  concurrent claims; browser automation did not read the private metrics endpoint
  because direct API navigation was blocked.
- [x] Verify loopback landing `/developers` and `/runs` CTAs and the public
  signed-out guide/sample navigation.
- [x] Connect the deployed staging dashboard to its staging API; test real sign-in,
  callback, private API identity and sign-out.
- [ ] Review/approve staging before merge and production promotion; validate
  production dashboard/landing URLs through that separate rollout.

## Google Calendar OAuth/provider — platform and UI owner

- [x] Dedicated staging OAuth configuration and real human consent completed with
  only `calendar.events.owned`, exact staging callback and independent server keys.
  This does not configure or qualify production OAuth.
- [x] Implement/review Settings consent start and `/calendar/oauth-return`
  relay under the initiating human session; clear query, handle expiry/one-time
  failure, actor changes, interrupted exchange and explicit restart.
- [x] Configure Cloudflare automatic invocation URL-log suppression and disable
  staging traces; reviewed config passed the staging build/dry-run.
- [x] Real same-session callback, original approved single synthetic event and
  workflow GET/read-back completed. Independent Google browser observation found
  zero then one event at the reserved identity and expected time. This is bounded
  original-grant dispatch proof, not an independent exact-field API inspector.
- [x] Natural refresh completed; original disconnect reached revoked revision 2,
  no pending revocation and empty encrypted payload. Renewed consent created a
  distinct active revision-0 connection; independent browser reload still showed
  the same one event. No second event/write or live revocation retry was performed.
- [x] Calendar feedback source `e26d3769…` integrated/deployed, with 19 focused
  tests and CI `38700202218`; renewed callback clears query and stays SUCCESS.
  Reloaded old card uses unknown provider outcome/no retry, not fabricated success.
- [ ] Complete deployed Tail/Logpush/proxy/custom-log and exhaustive session checks,
  full independent API inspector and renewed-grant API qualification. Identity and
  ownership remain unverified. Stored renewed consent/browser observation do not
  prove API access; forced expiry, all conflict cases and pending-retry acceptance
  are not inferred. Never replay an uncertain POST or mint a replacement event ID.
- [ ] Review operational recovery/retention without implying deletion or rollback;
  no compensation API is implemented. Mark provider availability only after these
  checks and consent UI are complete.

## Local MCP host and optional planner model

- [x] Official client → actual local stdio → live staging API initialization,
  discovery, retrieval, proposal, real OIDC human approval, verified completion
  and revocation; temporary scoped credentials stayed in process memory and were
  revoked afterward.
- [x] Disposable native OpenCode 2.0.18: cold filesystem legacy activation,
  in-place legacy→auto switch (bounded 1.2s settling), legacy+CodeMode reads and
  cross-tenant 404s; same-host revoked grant denied 401 and reconnect discovery
  failed closed. Nine model turns/eight actual MCP calls; all 17 processes stopped
  and five ports closed. See [native evidence](../operator-evidence/NATIVE-MODES.md).
- [ ] Qualify live staging native host, interactive TUI, cold CodeMode/auto+CodeMode,
  surviving-session switch and untested protocol/version combinations if required.
  Post-reconnect invocation was **not qualified** (no model tool trace).
- [ ] Close final live SDK read denial after owner revocation **before grant expiry**
  with a new separately authorized fixture. The prior hidden confirmation timed
  out; 52 helper tests, revocation metadata and disposable native 401s do not close
  that gap. Do not reuse the expired/revoked key or replan the completed graph.
- [ ] Keep MCP local stdio unless a separately designed/authenticated/authorized
  remote service is implemented. Do not advertise remote MCP OAuth or hosted URLs.
- [x] Obtain separate funded DeepSeek product API access and aggregate US$5
  evaluation approval. `deepseek-flash` / DeepSeek V4.1 Flash / high effort were
  positively verified. OpenCode uses the user's subscriptions only for development;
  those credentials never enter the product. No fallback or unpriced OpenAI product
  calls are enabled. Production defaults to disabled and zero lifetime calls.
- [ ] Approve excerpt transfer/data processing and provider retention policy;
  `store:false` alone is not a zero-retention guarantee. Keep keys/config server-only.
- [x] Run ten real synthetic model cases for decisions, missing/conflicting facts,
  adversarial containment, offsets and truncation; retain metadata-only cost/latency
  evidence. [Actual qualification](architecture/deepseek-live-evaluation-2026-10-14.md)
  records limits and the nonrefundable US$3.1678476 reservation. It does not prove
  legal reasoning or general prompt-injection immunity.
- [x] One supervised staging product canary completed: one paid `deepseek-flash`
  high-effort call, one action attempt, exact internal follow-up and verified
  database-read-back receipt at 06:56:56 UTC. Approval used the authorized owner's
  browser session operated by the coordinator. Its US$0.319488 reservation is
  already included above, not a new authorization. API/worker model disabled,
  limit 0, key bindings removed by 06:59:08 UTC; queue left paused. Broader
  disclosure/consent/retention and production review remain open.
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
- [x] Real staging private document assignment, exact approval/evidence, ordered
  verified receipts and viewer/organization boundaries. Correct select chevrons
  and plain contract step numbers; focused tests, lint and clean Next.js/TypeScript/
  OpenNext builds passed and staging was redeployed.
- [ ] Complete private operator browser checks under staging OIDC: calendar/mixed
  conditions, input history after reload, expiry, unknown receipts and role changes.
  Automated local component/API checks cover these, not a live private browser.
- [ ] Complete full keyboard/reduced-motion and accessibility checks. The focused
  disclosure/menu interactions above are not a full accessibility audit.
- [ ] Reassess capability copy after publication/provider/hosting gates pass.

## Subsequent product work

- [x] Implement a user-facing LensLayer agent service with shared checkpoints,
  explicit task assignment and a dedicated supervised-worker deployment plan.
- [x] Deploy bounded document tasks and complete real staging OIDC/worker/scanner/
  document-analysis acceptance through hosted and developer clients. Later bounded
  Calendar/product-canary proofs are recorded above with their remaining limits.
- [x] Supervised staging three-node graph: two succeeded follow-ups, one false
  no-effect skip, stable action/input/output IDs and receipt replay; independent
  task read-back found two tasks and none at the false branch's reserved output.
- [x] Root reports approved one-day PG18.6 recovery snapshot/schema and matching
  production table counts/primary-key digests; original migration source recovered.
  Candidate branch merge locally tested without stamping/reparenting/data drops.
- [ ] Root review and actual PG18.6 recovery-clone migration/restore acceptance, final
  merged-source/image binding, private-worker acceptance and separate rollout/
  traffic/wake/recovery approvals. Two scoped IAM grants are applied; worker-only
  Invoker is already explicitly approved but awaits the absent worker resource.
- [x] Implement/test the bounded source-retention correction: preserve contract/
  review/version/task/audit/agent-ledger records, erase extracted source, durable
  per-asset deletion/retry, expired-read/late-review fences and concurrent claims.
  See [retention follow-up](deployment/source-retention-review.md): **31 offline +
  12 local PG17.11 tests**, distinct from historical migration34+5 evidence.
- [ ] Independently review that runtime delta and qualify final image/PG18.6 clone,
  real object-store deletion/retry/locking and production-size maintenance before
  document-lane activation. No wholesale historical runtime/security review or
  live infrastructure acceptance is inferred.
- [x] Implement private retained context, explicit context delegation, lexical
  planning/evidence retrieval and context-backed task graphs with dependencies,
  approved boolean branches and not-before timers. Bounded graphs only create
  assigned follow-ups; mixed Calendar/document graphs and arbitrary execution are
  future scope. Hosted planning still covers three supplied-fact goal types.
- [ ] Select further goal types/connectors from customer workflows. These are
  subsequent product choices, not proof supplied by the current acceptance tests.
