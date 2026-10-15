# Agent infrastructure acceptance — 14 October 2026

**Updated through the coordinator's supplied 15 October 2026 finish update,
including the 17:13:21.750 UTC live SDK denial, 17:14:03 UTC independent
revocation readback and approximately 17:15 UTC dashboard asset reload.**
The 15:22:43 UTC Calendar GET, 15:25:19 UTC Calendar metadata and 16:37:29 UTC
production recovery-copy verification retain their separate dated boundaries.
This record consolidates supplied dated
evidence; this documentation review performed no new live verification.
Earlier test/deployment results retain
their original attribution and do not automatically qualify later source.

The roadmap is integrated on `codex/agent-roadmap-completion`, based on main
`0674a45122855ce1c7c65cd4f35c91c8f1fee75f`. [PR #5](https://github.com/udochukwu-echefu/lenslayer/pull/5)
is still **draft, unmerged and without merge approval**. Production API/schema
and activation are unchanged; the approved recovery copy is recorded separately.
Completed staging proofs below are not authorization to merge, publish, enable
another paid call or activate production.

## Latest supplied observations — 15 October 2026

Source: the coordinator’s retained finish records, especially
`FINISH-STATE.json`, `calendar-after-renewal-readback.json`,
`production-recovery-full-readback.json`, `main-protection-applied.json` and
`sdk-tag-protection-readback.json`, plus
`.lenslayer/finish-2026-10-15/sdk-live-02/progress.jsonl` and
`sdk-attempt2-revocation-readback.json`. The following supersedes only the corresponding
earlier status, not the attribution of historical tests or deployed bytes:

- **Calendar renewed grant qualified narrowly:** at **15:22:43 UTC**, the existing
  renewed connection GET of the original event succeeded and natural runtime-CAS
  refresh advanced revision **0 → 1**. Independent **15:25:19 UTC read-only DB
  metadata** confirms new active/revision 1, old revoked/revision 2/empty payload,
  neither pending revocation, and the original succeeded/approved one-attempt
  action with unchanged approved input hash/output. No event write, revocation
  retry or model call occurred. Independent Google API inspection/provenance,
  subject equality and exhaustive session/log acceptance remain open.
- **Fresh live SDK revocation PASS:** the actual SDK baseline at **17:12:33.557
  UTC** was followed by coordinator-operated owner-UI revocation at
  **17:13:20.840149 UTC** and actual SDK **401 at 17:13:21.750 UTC** (server Date
  **17:13:21 UTC**), before the fresh grant's **17:50 UTC** expiry. Independent
  **17:14:03 UTC** read-only DB metadata confirms revision 1, unchanged expiry/
  scope/owner membership and zero runs; no bearer/verifier was selected. This
  closes the earlier missed-expiry SDK gap, not native-host post-reconnect
  invocation or another graph execution. Full fresh-fixture binding is below.
- **SDK/operator/CI changes are not a release:** seven SDK preflight/guard files
  remain **uncommitted**; Root reports **23 affected tests passed in a path with
  spaces**, and independent review found no actionable P0/P1/P2. Node loader and
  Neon pooler wrappers were repaired/reviewed; **21 wrapper tests + 18 independent
  DB-boundary probes** passed offline. CI wiring now specifies Node **24.15.0**,
  PostgreSQL **18.6** and **91 offline operator identities**. Configuration and
  local results are not a new-source canonical CI success or image. Ordinary
  subprocess environment inheritance remains a limitation, not sanitization.
- **Backend source composition complete locally, not deployed:**
  `../production-readiness/CODE-COMPLETE.md` and its
  `.code-complete-local/FINAL-MANIFEST.json` bind **39 changed paths** and the
  actual combined **66 offline + 21 local PostgreSQL 17.11 passes, zero skips**.
  Original `6b1d3e8f2c57`/DAG are preserved; exact-attempt webhook fencing,
  historical email-default validation and the review-exception/source-retention
  P2 repairs are composed. Root integration and independent final review are
  ongoing. The earlier **34 offline + 5 local PG17** candidate result and earlier
  repair logs are historical, not proof of these newer bytes. No new canonical
  source-bound PG18.6 CI or final backend image exists in this record. Staging
  remains source **59320f31…** / image **b5888edb…**; production stays schema6b1.
- **Credential-copy repair committed/deployed, with a stale-tab explanation:**
  commit **`08c1a149636ce7a4d4d0a256aa288be6ad716faa`**, exact component SHA-256
  **`e060e09ad32329b8d701f7a45f97bf0738f8cbe270514ecc93e2dfed43d3ef54`**;
  **23 targeted React tests + lint**, **14 independent handler checks** and real
  Chrome synthetic normal/forced-Clipboard-API-denial paste checks passed. The
  isolated locked Next **16.3.8** / OpenNext **1.20.11** build passed; staging
  Worker **`40f15708-9306-4f3c-a369-61494e71d00b`** deployed **17:09:14 UTC**.
  Root verified the new assets after reloading at approximately **17:15 UTC**;
  the earlier user failure report came from an old loaded chunk. No additional
  credential was created for that reload, and the human has **not personally
  confirmed new-copy success**. This UI proof is not backend/new-source CI proof.
- **Production recovery copy verified further:** at **16:37:29 UTC**, read-only
  repeatable-read checks found all original values equal across **33 tables**,
  using salted server-side SHA-256 aggregates without exporting raw rows or
  retaining the salt. All column metadata/defaults, **223 indexes** and **470
  constraints** matched; `email_notifications` defaults to **true** in both
  databases. Both remain PG18.6/schema6b1. This qualifies the approved provider
  snapshot’s contents; no migration, independent archive or recovery-time
  objective was exercised. Its approved expiry remains 16 October 15:45:48 Lagos.
- **Protection, not release approval:** approved main protection is applied
  (strict required `test`, admins included, PR/conversation requirements, no force
  push/deletion; configured required approval count is **0**, not owner merge
  approval). Active SDK ruleset **25170113** restricts `sdk-v*` creation/update/
  deletion to the existing owner **User 285967218** as sole bypass actor. No SDK
  tag, signing or publication is implied. PR #5 remains draft/open/unmerged.
- **Narrow Cloudflare settings observation completed:** after existing SSO, Root
  inspected Worker Settings: logs **ON**, persistence **ON**, invocation logs
  **unchecked**, traces **OFF**, Issues **OFF**, no export destinations. Tabs were
  closed. This is not exhaustive legacy Logpush/Tail, callback-log or session
  acceptance, and does not mean all logging is off.
- **Remaining live operations:** independent Google API inspector/provenance is
  pending owner handoff. Native-host post-reconnect invocation and remaining
  identity/session/log/operational acceptance remain open. Both queues/recovery
  stay paused, models disabled/key unbound and private min-zero worker settings
  unchanged. Recovery provider-copy equality is not independent archive,
  RPO/RTO, candidate migration or full backup/restore acceptance. No new paid call
  is needed or authorized by these updates.

## The five tracks

**Coordinator integration update after the snapshot above:** the exact 39-path
backend candidate is now integrated in the project checkout. Its 66 focused
offline checks also passed from the real project path containing spaces. The
independent combined review found no actionable P0/P1/P2 in the other author's
webhook/default/DAG/fixture changes; the coordinator separately reviewed the
retention exception fence and its enabled-effect regression assertions. All
**58 Node + 33 Python operator checks** passed again after this integration.
These changes and the SDK preflight are included with this completion record;
the earlier “uncommitted/integration ongoing” wording describes its dated
17:15 UTC snapshot. New exact-source canonical CI, image and deployment gates
remain separate. See PR #5's required `test` check for the current CI result.

| Track | Implemented / local verification | Completed dated external evidence | Remaining acceptance / owner gates |
| --- | --- | --- | --- |
| Production execution and operations | Private request-driven worker/release guard; 39-path backend candidate locally code-complete with three P2 repairs composed; 66 offline + 21 local PG17.11, zero skips | Staging private-worker/graph/canary/email proofs; approved PG18.6 provider-copy full-value/catalog match; narrow Cloudflare settings read | Root integration/final independent review, new-source canonical PG18.6 CI and recovery-clone candidate rehearsal, backup/restore, exact image/private-worker review and authorized activation; remaining logging/alerts/incident closure unqualified |
| Developer SDK and MCP | SDK-only MIT and bounded APIs; historical 79/eight adversarial/18-file checks; uncommitted seven-file preflight has 23 affected space-path passes; reviewed operator wrappers | Disposable native modes/fail-closed reconnect discovery; staging graph/receipt replay; fresh actual-SDK pre-expiry 401 at 17:13:21.750 UTC with independent revocation metadata; applied main/owner-only SDK tag protection; deployed copy repair | New exact-source CI; live native-host/post-reconnect/protocol gaps; human confirmation of new copy UI; owner-approved merge/main artifact/tag, real signing/publication and registry proof |
| Calendar | Session-bound relay, encrypted grants and stable event identity; deployed feedback with 19 focused tests/green CI; read-only operator tools integrated but uncommitted | Original one-event/browser/refresh/revocation proofs; renewed-grant existing-event GET and natural runtime-CAS refresh 0 → 1 at 15:22:43 UTC, independently confirmed metadata at 15:25:19 UTC | Independent Google API inspector/provenance, identity/ownership/subject equality and exhaustive session/log acceptance remain open |
| Optional product model | Explicit selection/disclosure, closed decision adapter, immutable facts, durable zero-default lifetime admission | Ten synthetic live DeepSeek evaluations; **one completed paid product canary**, exact approved internal follow-up and verified receipt; model disabled/key bindings removed afterward | No further paid invocation implied; broader disclosure/consent, retention and production review remain owner gates; production stays model-disabled |
| Broader agent workflows | Private versioned context, lexical retrieval/original offsets, typed context-task tool, dependency/conditional/not-before graphs and SDK/MCP/example/UI | Staging v1/v2 context/hash reads; three-node graph with two tasks/no-effect false skip/stable receipt replay; separate fresh SDK scope/revocation/pre-expiry denial proof | Exhaustive live recovery/timer/retention/role/narrow-screen and native-host protocol acceptance is not claimed; no graph repeat needed to close the now-completed SDK denial gap |

Graph support remains bounded to **1–20 context-backed follow-up nodes**, explicit
approved targets and stable receipts. There is no arbitrary code execution,
recurring workflow, mixed Calendar/document graph, automatic approval renewal or
general autonomous planner. Context search uses lexical AND terms; large-workspace
indexing, organization storage quotas and load qualification remain future work.
The model only chooses `proceed`, `needs_input` or `decline` for supplied facts;
it cannot grant authority, approve a write or certify business completion.

## Source, CI, image and current revision bindings

| Evidence boundary | Supplied identity / attribution |
| --- | --- |
| Calendar feedback source | Integrated, committed and pushed as **`e26d3769a60a869dcea96ef886a5390ba4a68cf8`**; [CI run 38700202218](https://github.com/udochukwu-echefu/lenslayer/actions/runs/38700202218) **completed successfully**, separately read back by the coordinator |
| Previous green source / CI | `80f74dc6eee04e16a2a015d2b7e00253c759cd17`; [green CI run 38697005779](https://github.com/udochukwu-echefu/lenslayer/actions/runs/38697005779). Its success is not attributed to the newer commit |
| Security/backend runtime source | `59320f31b3e6708050a2a17516ae967d39fe4d9f`; [security CI run 38694392903](https://github.com/udochukwu-echefu/lenslayer/actions/runs/38694392903); **267 offline + 146 real PostgreSQL = 413 passed identities**. The composed candidate awaits final Root integration/review/new CI and is not qualified or deployed by this historical result |
| Current staging backend image | `europe-west1-docker.pkg.dev/lenslayer/lenslayer/platform-staging@sha256:b5888edb70c1db3468b9937e43db41641a8fef955573aca9c258c9867ee42233`, bound to security/backend source `59320f31…` |
| Canary runtime → disabled runtime | API `lenslayer-api-staging-00006-rqx` → **`lenslayer-api-staging-00007-hrc`**; worker `lenslayer-agent-worker-staging-00006-ll8` → **`lenslayer-agent-worker-staging-00007-nhr`**. Before/after metadata binds both revisions to the same `b5888edb…` image; disable finished by **06:59:08 UTC** |
| Current staging dashboard | Copy-fix commit **`08c1a149636ce7a4d4d0a256aa288be6ad716faa`**, Worker **`40f15708-9306-4f3c-a369-61494e71d00b`**, deployed **17:09:14 UTC**; isolated locked Next **16.3.8** / OpenNext **1.20.11** build passed; public agents JS SHA-256 **`f6700794c1b3672fa8ad368e08ba8b7f627ca28337fa0393b3fbbec93d956ef5`** matches artifact; new browser assets verified after approximately 17:15 UTC reload |
| Pending SDK/operator/CI integration | Seven SDK files still **uncommitted**, 23 affected tests passed in space path; reviewed/fixed loader and Neon wrappers, 21 wrapper tests + 18 independent DB probes. CI configuration targets PG18.6/Node24.15/91 offline operator identities; **no new-source canonical CI success or backend image** asserted |
| Frozen composed backend candidate | `.code-complete-local/FINAL-MANIFEST.json` SHA-256 **`c7354eb92c163cc5f0528f233cb03a04315db9bd347ab1c038009ae43e00ee33`**, 39 changed paths; 66 offline + 21 real local PG17.11 passes, zero skips. No Git commit/CI/image/production identity is inferred from this local freeze |

The security changes refresh locked agent authority before retained-context reads
and reject terminal/revoked runs at the last paid-provider HTTP boundary after
durable charge. They are **committed and CI/image-bound**, not the uncommitted
candidate described by the superseded draft. Historical source/CI checkpoints,
the current dashboard copy-fix commit and backend-image source are separate
boundaries; do not relabel the backend image as a build of `80f74dc6…`,
`e26d3769…` or `08c1a149…`. Calendar feedback CI is independently
recorded above; that source did not change the backend.
No CI or deployment was re-queried by this documentation review.

Historical bindings remain useful, but are superseded for current runtime:

- Calendar-feedback dashboard source **`e26d3769…`** / Worker
  **`0eb47238-51c8-45d8-a474-065a9eae31fb`**, observed **07:45:16 UTC**, preceded
  the 17:09:14 UTC copy-fix deployment. Its 19 focused Calendar tests and green
  CI **38700202218** qualify that earlier source, not the later copy fix.
- Dashboard source `80f74dc6…` / Worker version
  `aa3b615c-4a95-4992-939a-598f3f36e9f5` preceded the deployed Calendar-feedback
  update; its preserved source/build proof is historical, not the current dashboard.
- Source `27311a610ebb730acb77a426bdf34ac5963cc13a` had successful
  [CI run 38654924859](https://github.com/udochukwu-echefu/lenslayer/actions/runs/38654924859).
  Cloud Build `d699950f-f710-483f-9b68-6acfdffffbea` built its exact archive to
  `sha256:aea8b8f82bfbfe325bb00f66affa206061a58fc06e35f6bb0f0acb8d0d2cc6fa`;
  initial staging API/worker revision 00004 used that image. The archive omitted
  secrets and the user's untracked video document.
- Source `7aadbd24370249e0b2fe9cda79faaf8d6b605bb9` had successful
  [CI run 38691486766](https://github.com/udochukwu-echefu/lenslayer/actions/runs/38691486766)
  and reported build digest
  `sha256:7052bad0a579452ad67737eacd8bdc358749a611bba3fd81844a03389fab155b`.
  Those results are historical, not qualification of later security changes.
- Earlier staging API `00005-qhc` / worker `00005-5pn` and their context-browser
  checks preceded the canary/current revisions. Initial OIDC login, live hydration,
  authenticated context creation and private/anonymous route checks remain limited
  to the revisions and paths actually exercised.

## Local verification: current and historical attribution

**Security source `59320f31…`:** 413 distinct backend identities passed: **267
offline** and **146 real disposable PostgreSQL**. Later portable Unix socket
launcher checks passed **three focused regressions**, including real cluster
startup and cleanup after successful and deliberately failing suites; this is
harness evidence, not three additional application acceptance identities.

The earlier roadmap verification used disposable synthetic data, omitted real
environment files and did not use development subscription credentials in product
code:

- Backend discovery: **396 total, 254 passed, 142 PostgreSQL checks skipped**;
  separate PostgreSQL **17.11** run: **142 passed**, covering migration drift,
  graph predicates/dependencies, receipt binding, leases, Calendar session proofs
  and concurrent lifetime admission. These are historical counts, not the newer 413.
- SDK: **53 passed**, including the actual 18-file MIT tarball, offline consumer,
  ESM imports and TypeScript declarations. MCP: **10 passed** using the official
  client and spawned stdio adapter. Examples: **15 passed**. Hosted planner:
  **23 passed**, including restart without replanning or duplicate effects.
- Combined disposable API/worker integration passed document and fake-provider
  Calendar workflows, approval, replay, restart and uncertain-outcome read-back.
  Fake provider HTTP is not live provider acceptance.
- Dashboard: **243 passed across 37 files**, lint/build and staging dry run.
  Actual deployment exposed the OpenNext 1.20.11 / Next 16.4.1 manifest mismatch;
  Next and eslint-config-next were pinned to **16.3.8**. The corrected build passed
  those tests, production dependency audit and actual local workerd HTTP/browser
  hydration for `/context`, `/agent-tasks`, `/contracts/new`. That alone was not
  live staging proof. Production dependency audit reported zero vulnerabilities;
  the unpatched `braces` development dependency means the all-dependency audit was
  **not** claimed clean.

The earlier integrated SDK handoff implementation passed **79 offline tests**, the actual
**18-file pack-and-consumer check**, and **eight independent adversarial cases**.
The independent checks ran again on patched **Sigstore 4.1.1**. These are source
and local-artifact results; real signing/publication requires the owner gates below.

The earlier 15 October integration snapshot over checkpoint
`c926f1968bbffc48d27c1231554acf40a9aa9472` reported **58 Node + 32 Python operator
tests** under network denial. Those are historical source-specific local results,
not a new canonical run or automatic qualification of later loader/Neon/wrapper
changes. Current evidence separately records the 21 wrapper tests/18 independent
DB probes and the affected SDK 23-test space-path run. The CI definition now
contains 91 offline operator identities; its presence does not prove execution
on the final integrated source.

The composed backend freeze at
`../production-readiness/.code-complete-local/FINAL-MANIFEST.json` (SHA-256
`c7354eb92c163cc5f0528f233cb03a04315db9bd347ab1c038009ae43e00ee33`) binds the
39-path candidate's **66 offline + 21 local PG17.11 passes, zero skips**. It
composes exact-attempt webhook completion fencing, fail-closed historical default
validation and the source-retention/review-exception repair. Original migration
6b1 bytes and both applied branches remain intact at the forward-only c7a merge;
no stamp, reparent, opt-out/key overwrite or spent-budget reset is authorized.
Root final integration/review and new-source canonical PG18.6 CI are still gates;
local PG17.11 results are not PG18.6 or final-image acceptance. Earlier candidate
and independent repair logs retain their own hashes and cannot qualify this
composition automatically.

## Native OpenCode: disposable four-mode evidence

The later qualification used actual **OpenCode 2.0.18**, Node **24.15.0**, fresh
private loopback `opencode serve` hosts and **OpenAI GPT 6.1 Sol high** throughout.
It checked four exact security-source files, not an entire-checkout commit identity.
The real disposable API had synthetic organizations, expiring grants and unapproved
graphs; no worker, Calendar, email or funded product model ran.

| Mode | Actual retained evidence | Qualification / limit |
| --- | --- | --- |
| Cold filesystem activation | Project config, legacy protocol, CodeMode off; native runs-list completed without runtime activation PUT | Pass for private server filesystem activation, **not interactive TUI `--standalone`** |
| In-place protocol switch | Same host legacy read → full config update to auto → successful read; cross-tenant runs-status **404** | Pass with one bounded **1.2-second** registry settling interval; no earlier race root cause established |
| CodeMode | Actual model `execute` used discovered runs-list; another-tenant runs-status **404** | Pass for exercised legacy + CodeMode reads/scope denial |
| Revocation/reconnect | Native baseline read, owner revocation, same-host read **401**; disconnect/connect started a fresh adapter, tool discovery failed and catalog became `failed` | Pass for **fail-closed reconnect discovery only**; final model turn had no tool trace, so **post-reconnect invocation is not qualified** |

There were **9 model turns and 8 actual MCP calls**, with matching session metadata
and backend results. Legacy handshakes retained `2025-11-25`; auto used
`server/discover`, then `tools/list`, without legacy `initialize`. Exact selected
modern revision fields were not retained. Cold CodeMode, auto+CodeMode, interactive
TUI and a surviving preexisting session across switching were not tested. Earlier
legacy/fresh-auto checks are historical context, not grounds to retain the stale
claim that in-place switching and CodeMode still have no successful traces.

All four native hosts, adapter/observer children and disposable backend stopped:
**17 processes gone, five loopback ports closed**. This evidence is **not live
staging/native-host acceptance** and does not qualify arbitrary hosts/protocols.
The later fresh live SDK denial below closes that separate SDK gap only; it does
not retrospectively qualify native-host post-reconnect invocation.

## Completed real staging context-graph check

The supervised SDK check ran **06:19:37–06:20:07 UTC on 15 October**, run
`61a7a27d-b5e8-4736-aa11-b235d0c4d92f`. It produced **two succeeded actions and
one cancelled false-branch action**, stable original action/input/output IDs, and
completed-receipt ID stability across the single supported replay. Independent
task metadata read-back found exactly the two expected tasks and **no task at the
false branch's reserved output ID**. This is no-effect skip proof, not a third task.
The queue was paused afterward; production was unchanged.

**Historical missed-expiry gap, now superseded by the fresh proof below:** the
earlier owner revocation did not produce a live SDK denial before expiry because the helper's
hidden confirmation timed out. Its subsequent TTY/timeout fix was reviewed and
passed **52 local tests**; the live graph was not repeated. Revocation metadata,
disposable-host 401s and fail-closed reconnect discovery cannot substitute for
that earlier missing live denial. Never reuse the expired/revoked credential, replan the
completed graph or manufacture retroactive pre-expiry evidence.

## Completed fresh live SDK revocation proof — 17:12–17:14 UTC

The hidden-getpass wrapper and bounded GET-only actual-SDK observer were used for
a **new empty fixture**, not another graph/action. Fresh agent
**`9d5affa2-f0f9-42a7-ab9a-ec6f46347677`** was created at
**17:11:41.991099 UTC**, expiring **17:50 UTC**. Scope was exactly
`context.retrieve` + `workspace.context_tasks.create`, one synthetic context and
owner assignee, approval required, max one action, no contracts or Calendar
targets. Evidence:

| Event | Supplied actual observation |
| --- | --- |
| Positive actual-SDK baseline | **17:12:33.557 UTC** |
| Revocation in owner's existing UI, operated by coordinator | **17:13:20.840149 UTC** |
| Same-credential actual-SDK denial | **HTTP 401, 17:13:21.750 UTC**; server Date **17:13:21 UTC**, both before expiry |
| Independent read-only DB confirmation | **17:14:03 UTC**: revision **1**, same expiry/scope and retained owner membership, **zero runs**, no bearer/verifier selected |

Root retains `.lenslayer/finish-2026-10-15/sdk-live-02/progress.jsonl` and
`sdk-attempt2-revocation-readback.json`. This **closes the previous live SDK
revocation-before-expiry gap**. It does not qualify native-host post-reconnect
invocation, new graph effects, arbitrary tools/protocols or SDK publication.
The first unused credential attempt, **`3f580417…`**, failed **before baseline**
on Neon empty-service/startup-option connection handling and was revoked unused.
It is not a pass or a completed-graph retry. Connection corrections were reviewed;
local 21-wrapper/18-DB-probe results and the earlier read-only Neon preflight are
separate evidence, not substitutes for this actual live baseline/denial.

## Credential-copy repair and browser-cache boundary

The copy fix at commit **`08c1a149636ce7a4d4d0a256aa288be6ad716faa`** binds component
SHA-256 **`e060e09ad32329b8d701f7a45f97bf0738f8cbe270514ecc93e2dfed43d3ef54`**.
Root reports 23 targeted React tests and lint, 14 independent controlled handler
checks, and real Chrome **synthetic** normal and forced Clipboard-API-denial
fallback/paste checks. The isolated locked Next16.3.8/OpenNext1.20.11 build passed;
the staging deployment/asset binding is in the table above.

The user subsequently reported copying still failed. Actual DOM inspection found
the tab still loaded **`8073-8c4310d849321046.js`** because Root had refreshed
before deployment completed. At approximately **17:15 UTC**, Root reloaded and
verified **`8073-2eeeeb87f0b60399.js`** and the **`agents/page344ec6…`** asset.
No additional credential was created for this reload. This establishes the stale
tab explanation and new asset delivery, **not personal user confirmation of
copying successfully with the new UI** or any actual-credential browser copy test.

## Completed paid canary and immutable budget

The [ten-case live DeepSeek evaluation](deepseek-live-evaluation-2026-10-14.md)
passed **10/10** synthetic requests. Its conservative reported usage estimate was
**US$0.0059391**, not a provider invoice. Its durable nonrefundable reservation
remains **US$3.1678476** under the aggregate **US$5** authorization.

The previously admitted canary is now **COMPLETE**, not merely queued/admitted.
Read-only evidence at **06:57:50 UTC** records hosted task/run success, phase
`complete`, model state `accepted`, **one** paid `deepseek-flash` / high-effort
call, one action attempt and exact persisted internal follow-up fields with a
`database_read_back` verified receipt at **06:56:56 UTC**. Approval used the
authorized owner's browser session, operated by the coordinator; this is **not**
a claim the human personally clicked every field. It qualifies this bounded
product path, not arbitrary planning or exhaustive browser/disclosure acceptance.

| Aggregate budget item | Reserved US$ |
| --- | ---: |
| Ten evaluations | 3.1678476 |
| One completed product canary | 0.319488 |
| Total reserved | **3.4873356** |
| Remaining original authorization | **1.5126644** |

The reservation is not refunded/reset because reported usage was lower or a
tenant/run is deleted. There is no new US$5 allowance and no automatic retry of
an unknown charged call. The global lifetime gate defaults to zero, permits at
most one paid product call and preserves spent records through deletion/rollback.
After the canary, staging API/worker model mode was set **false**, call limit
**0**, model-key bindings **removed**, and queue left **paused**, on the revision
bindings above. Production stays model-disabled. No further paid call is implied.

## Real Calendar proof and explicit inspector/reconnect limits

Later staging evidence supersedes the prior “consent stored only” status:

- Real human consent was stored through the session-bound browser callback for
  the dedicated sandbox product grant. Product scope remained only
  `calendar.events.owned`; no scope widening was used to complete the check.
- A single synthetic private event was created with stable identity and workflow
  GET/read-back. Independent read-only Google browser observation of the selected
  disposable secondary calendar showed **zero events before, one afterward**;
  observed event identity matched the preallocated action output and displayed
  **15 October 09:00–09:15 UTC / 10:00–10:15 Africa/Lagos** as expected.
- The coordinator records **natural refresh**, rather than claiming that a
  separately forced-expiry inspector harness ran. Read-only metadata at
  **07:18:16 UTC** showed the original connection active, credential revision 1,
  `revoke_pending=false`; encrypted token values were not selected.
- Disconnect completed provider revocation. Metadata at **07:23:08 UTC** showed
  the original connection **revoked**, credential revision **2**, revoked-at
  **07:22:01 UTC**, and **`revoke_pending=false`**. No retry was executed.
- Renewed real human Google consent subsequently stored a **new connection** and
  the callback **cleared its query and remained SUCCESS after the timer**. Read-only
  metadata at **07:38:18 UTC** confirms a distinct **active, revision-0** connection
  for the same disposable calendar, with no pending revocation. The old connection
  remains revoked at revision 2, not pending, with **empty encrypted payload**
  reported as a boolean; token values were not selected.
- An independent Google UI reload after the morning reconnect still showed **one event with
  the same preallocated event identity**, with no second write/event. This is
  browser-observation evidence; **at that earlier observation**, renewed-grant API
  qualification was still open. Stored consent/unchanged UI alone did not prove it.
- **Renewed-grant GET/refresh now completed:** at **15:22:43 UTC**, connection
  `75a57c6d-2b10-4b25-9a4c-a96658ff4abe` successfully GET-read the existing event
  `llaff707c0c9064758bda6e85905917737`. Natural refresh used the existing runtime's
  encrypted-token CAS persistence and advanced credential revision **0 → 1**;
  this was not forced expiry or a dropped rotated refresh token. Independent
  **15:25:19 UTC** read-only metadata selected no tokens and confirms active/
  revision 1/no pending revoke, old connection revoked/revision 2/empty encrypted
  payload/no pending revoke, and original action
  `96e786d7-74f1-4f4c-82be-c4f9b5e95377` still succeeded/approved/one attempt with
  unchanged approved input hash and output `aff707c0-c906-4758-bda6-e85905917737`.
  **No new event write, grant, revocation retry or model call** occurred. This
  closes renewed-grant existing-event access/natural refresh only, not an
  independent Google API inspection or a new action/dispatch/final disconnect.

**The full independent API inspector harness remains unqualified and pending
owner handoff/provenance.** At the earlier Google Playground scope-preparation
observation, **Authorize had not occurred**; no newer independent inspector
consent/token/API result is supplied by this update. Independent browser observation is
not an inspector CalendarList ownership check or complete exact-field API audit.
Product metadata still marks provider account identity and calendar ownership
**unverified**. Do not claim equality of Google account subjects, automatic
provider compensation, exhaustive callback-log/session acceptance, or all fields
of the [disposable Calendar guide](../calendar-disposable-acceptance.md) passed.
Any future independent inspector must use a different OAuth project, because
product-project revocation affects its other grants too. Uncertain dispatch stays
GET-only reconciliation: never replay a POST or mint a replacement event ID.

The Calendar revocation-feedback UI is now **integrated, committed, pushed and
deployed** at the source/dashboard bindings above; **19 focused tests, lint, build
and deployment passed**. Live owner Settings hydrated and correctly showed the
renewed active connection and old locally revoked connection. After reload, the
old card uses **unknown provider outcome / no retry**, not a fabricated success.
Server-known false means no pending revocation/no retry; known true permits an
explicit retry. Unknown UI state does not override the separate read-only metadata
proving completed original revocation. **No live provider retry was performed.**
The backend image is unchanged; the feedback commit's full CI completed successfully.
The later copy-fix dashboard deployment supersedes the feedback-only Worker
version but does not relabel that earlier CI as a pass for the newer source.

## Operational alert receipt and safe infrastructure state

The coordinator records ten enabled policies, five each for staging/production,
covering worker HTTP failures, ledger attention, hourly recovery failure, missed
post-commit wakes and unsuccessful task delivery. **Actual staging operational
email receipt is now proved narrowly**: the owner supplied a screenshot and
confirmed receipt for **“LensLayer agent ledger needs attention-staging.”**

That alert started **06:50 UTC**; the **06:50:14 UTC** worker-00006 ledger log
reported `attention` and **1,392 overdue seconds** while the admitted canary was
intentionally held in the paused queue for review. At **06:56:58 UTC**, health
was `healthy`, overdue zero, with zero expired action leases, unknown outcomes,
pending provider revocations and recent partial effects. This proves that
**operational ledger policy/channel's actual email path**, not receipt of the
previous night's synthetic test, every policy, product notification email or
production delivery. Incident closure was not queried; a healthy ledger does
not establish auto-closure. No additional synthetic log/email was sent for this
documentation update.

**Later narrow Worker Settings observation:** Root used existing Cloudflare SSO
and inspected logs **ON**, persistence **ON**, invocation logs **unchecked**,
traces **OFF**, Issues **OFF**, and **no export destinations**; tabs were closed.
This supersedes the earlier pending-browser-login status only. It is not
exhaustive legacy Logpush/Tail inventory, callback-log redaction, session/browser
acceptance, or proof that custom/persisted logging is absent. The one delivered
ledger alert still does not qualify every policy/channel or incident closure.

- **Staging worker:** private invocation, service/revision minimum **0**, maximum
  **1**, concurrency **1**, request-based CPU, 120-second bounded drain. Prior
  inspection found manual-scaling/disabled-invoker annotations absent. Final
  **07:42:11 UTC read-only configuration** reconfirms the same backend image and
  current API/worker revisions, worker `on_demand`, zero service/revision minima,
  max one, request-based CPU and **no anonymous IAM grant**. Both staging models
  remain **false / limit 0 / no model-key binding**. Staging and production queues
  and the recovery schedule are **paused**. The old continuous pool's last supplied
  observation was zero; **actual current instance counts were not queried**.
  Minimum-zero configuration is not a measurement of zero running instances.
  The API has different limits: service max **3**, revision max **1**, concurrency
  **20**, both minimums zero—not worker max-one semantics applied to the API.
- **Production:** API **`lenslayer-api-00007-2jm`**, schema **`6b1d3e8f2c57`**,
  queue **paused**, unchanged. Queue-only Enqueuer and invoker-account-only
  Service Account User grants were previously approved/applied/read back. The
  final worker-only Invoker grant awaits the private production worker resource.
  **No production worker rollout, migration or traffic promotion** occurred.
- **Historical staging recovery:** the staging-only recovery branch had a successful read-only
  schema/data check and autosuspended compute. Its recorded expiry is
  **16 October 2026 00:00:52 Africa/Lagos**. That does not constitute a production
  recovery point or completed production backup/restore; the owner must review
  retention/expiry without treating a staging branch as production protection.
- **Approved production provider recovery copy:** at **14:51:01 UTC**, read-only
  checks of production and branch **`br-cold-credit-b11o29gv`**, endpoint
  **`ep-gentle-shape-b1tu23h7`**, in the same Neon project confirmed both on
  **PostgreSQL 18.6**, schema **`6b1d3e8f2c57`**, with **33 table counts/primary-key
  digests and column metadata matching**. Approved one-day auto-delete is
  **16 October 2026 15:45:48 Africa/Lagos**, distinct from the earlier staging
  branch expiry. Compute configuration is **0.25 CU min/max, 300-second idle
  autosuspend**; actual suspended state was not observed. This is **provider-copy
  match only** (later all-value/catalog verification above), not an independently stored archive,
  migration or completed restore acceptance. No production DDL, worker deployment
  or activation occurred; backup/restore acceptance remains open.
- **OAuth:** dedicated sandbox setup, exact staging callback, independent
  server-side keys and narrowly scoped staging-runtime bindings are historical
  setup evidence, not production grants or full inspector qualification. Do not
  expose codes, tokens, personal calendar identifiers or callback queries in logs.

A fresh read-only infrastructure check recorded **15 October 2026 11:20:25 UTC** reconfirmed
private on-demand worker configuration, service/revision min-zero/max-one,
request-based CPU, paused staging/production queues and paused staging recovery.
Both staging services have model mode false, lifetime limit zero and no model-key
binding. Production remains revision `lenslayer-api-00007-2jm`. Current instance
counts were not queried; this proves scale-to-zero configuration, not a measured
zero-instance sample.

## SDK signing/bootstrap and release gates

The npm organization exists with zero packages; owner MFA is enabled. The
owner-reviewed **`sdk-npm`** environment is main-only with administrator bypass
**false**. **`SDK_NPM_PUBLISH_ENABLED` remains absent/off.** No live SDK signature
or package publication has been created.

Approved main protection and active owner-only **SDK tag ruleset 25170113** are
now applied/read back; they do not constitute an actual version tag, merge
approval, signature or publication. The new seven-file preflight/guard delta
adds literal `can_admins_bypass=false` enforcement and real-verifier-gated owner
commands with before/after-login checks. Its independent review found no
actionable P0/P1/P2, but ordinary subprocess environment inheritance can forward
existing credential variables; the tool does **not** sanitize that environment.
The root's 23 changed-suite passes are local/network-denied evidence only, not a
new canonical CI or real cryptographic publication/bootstrap acceptance. They
actually passed in a checkout path with spaces after native file-URL conversion
fixes; those test-path fixes do not relax release guards. These seven files
remain uncommitted at this observation. The source-composed backend and operator
results above are separate from the old SDK pack/signature fixtures.

The actual fresh-grant SDK baseline/revocation/401 and independent readback above
now close runtime **pre-expiry denial**, not the release gates below. The copy UI
is separately committed/deployed; no additional credential creation, tag, signing
or publication is needed to reinterpret that completed denial evidence.

The **earlier 22-file SDK handoff implementation was integrated and independently reviewed**.
The original signer-identity and approval-attempt defects are fixed: raw bundle
oneofs are validated before verification, the qualified certificate is the verified
leaf, the signer URI must match exactly, and detached signing requires attempt 1
of a fresh owner-approved dispatch. Independent review found no actionable
P0/P1/P2 defect in the final source. It exercised 83 malformed specimens in both
qualification paths and 62 release-control failure specimens in eight adversarial
cases, alongside **79 SDK tests** and an actual **18-file archive/consumer check**.

A separate dependency audit found the upstream
[Sigstore certificate-OID advisory](https://github.com/advisories/GHSA-52v5-jr5w-gjxr).
The exact dev pin is now **4.1.1**, and all 51 other lock entries are unchanged.
The wrapper uses issuer plus exact URI rather than the affected OID option; no
LensLayer exploit was observed. The independent patch review repeated all 79 tests,
eight adversarial cases and the 18-file archive check on the installed patch.
A fresh **all-class SDK dependency audit reported zero vulnerabilities**. This
SDK audit does not replace the separately recorded dashboard dependency results.

**Actionlint 1.7.12** also passed the exact unchanged publisher workflow with no
errors or warnings, under network denial; ShellCheck/Pyflakes were disabled and
are not claimed. Those frozen reviewed bytes qualify that earlier SDK boundary,
not the full new uncommitted preflight/operator/CI delta.
See [PR #5 checks](https://github.com/udochukwu-echefu/lenslayer/pull/5/checks) for
canonical CI on the current pushed commit. The backend/dashboard bindings above
remain their separately verified deployment identities.

The release-window contract is explicit. CI requires the enable flag's
**dispatch/job snapshot** and freshly reads the canonical workflow's active state
with the existing Actions-read permission, alongside source/review/artifact checks
immediately before signing or publication. The owner verifier also reads the live
flag. Closing a window requires **disable workflow, clear flag, cancel every
non-completed release run, verify terminality and inspect possible external effects**.
Changing the flag or disabling the workflow alone does not cancel admitted work;
a cancellation cannot undo an already-created signature or upload. The reviewed
procedure adds no owner credential or fallback token to CI.

Implicit provenance metadata was removed before any approved package existed to
support the official detached-file handoff. Direct OIDC publication still requires
explicit **`--provenance`**; the owner's first upload uses the original reviewed
`.tgz`, its real verified bundle and **`--provenance-file`**. A source hook cannot
enforce arbitrary owner commands using `--ignore-scripts`. The SDK remains runtime
dependency-free and **MIT applies to the SDK only**.

The local historical-signature and synthetic fixtures establish regression proof;
actual canonical-main artifacts, fresh TUF/Fulcio/Rekor, managed GitHub environment
behavior, first-package publication and real registry byte/signature/provenance
acceptance remain owner release gates. See [SDK distribution setup](../../sdk/DISTRIBUTION.md)
and the [developer release checklist](../developer-release-checklist.md).

## Ordered remaining owner gates

1. **Review and merge:** complete Root integration and independent final review
   of the locally code-complete 39-path backend composition; the three P2 repairs
   are composed, not still waiting to be authored. Retain exact source/CI/runtime
   attribution and obtain new canonical **PG18.6/Node24.15** CI for the final
   committed SDK/operator/CI/backend source, including the configured 91 offline
   operator identities. The SDK seven-file delta remains uncommitted, and neither
   historical CI **38700202218** nor the local freeze qualifies these newer bytes.
   Then obtain explicit PR #5 review and merge approval; main/tag
   protection is applied but is not that approval. Preserve completed staging
   action evidence while reviewing the final source.
2. **Close only genuine staging gaps under separate authorization:** the fresh
   live SDK denial **before expiry is complete**, as is renewed Calendar
   existing-event GET/natural refresh. Do not create another credential or rerun
   the completed graph merely to close those gates again. Separately finish
   independent Google API inspector/provenance and remaining identity/session/log
   checks, live native-host/post-reconnect invocation, broader recovery/retention/
   role/UI cases, and human confirmation of copying from the newly loaded UI.
   Completed graph/canary/event/email proofs remain completed but bounded.
3. **Production recovery and deployment:** after approved main merge, build and
   review the exact final source/image/deployment plan; verify production backup
   and restore beyond the PG18.6 provider-copy full-value/catalog match above.
   Require the final candidate's approved **PG18.6 recovery-clone migration/runtime
   rehearsal**, final scoped invoker grant and private min-zero worker behavior;
   narrow Cloudflare settings inspection is complete but exhaustive logging/
   observability/session acceptance remains unqualified.
   Only then separately authorize migration, private acceptance, traffic promotion
    and wake/recovery activation. Production runtime remains unchanged until those gates.
4. **Public SDK release:** obtain canonical main artifact and tag, approve public
   Sigstore signing and environment review, have the owner publish the exact
   tarball/bundle with provenance for first bootstrap, then verify actual registry
   bytes/signatures/provenance. Package-specific trusted publisher configuration
   is a future OIDC gate. No signing/publication/main merge has occurred here.
5. **Preserve spending and pause controls:** do not reset reservations, issue a
   replacement canary, retry uncertainty or widen grants. Keep model disabled and
   queues/recovery paused absent their own activation approval; inspect existing
   recovery jobs before update/resume rather than relying on create-if-absent.
   Reservations stay **US$3.4873356 of US$5**; no further paid call is needed or
   authorized by this reconciliation.

The [worker operations runbook](../deployment/agent-worker-operations.md) governs
scale-to-zero and recovery. Request-based CPU/minimum zero saves idle compute,
not database/storage, queue/recovery, cold-start or actual job costs. No empty
polling worker is an acceptable workaround. Rendered gate labels and a legacy
pipeline's active-queue prerequisites are **not** authorization or automatic
enforcement of release/production gates.
