# Agent infrastructure acceptance — 14 October 2026

**Updated through the coordinator's verified observations of 15 October 2026,
including the 07:45 UTC staging refresh.** This record consolidates supplied dated
evidence; this documentation review performed no new live verification.
Earlier test/deployment results retain
their original attribution and do not automatically qualify later source.

The roadmap is integrated on `codex/agent-roadmap-completion`, based on main
`0674a45122855ce1c7c65cd4f35c91c8f1fee75f`. [PR #5](https://github.com/udochukwu-echefu/lenslayer/pull/5)
is still **draft, unmerged and without merge approval**. Production is unchanged.
Completed staging proofs below are not authorization to merge, publish, enable
another paid call or activate production.

## The five tracks

| Track | Implemented / local verification | Completed dated external evidence | Remaining acceptance / owner gates |
| --- | --- | --- | --- |
| Production execution and operations | Private request-driven worker, bounded drain, scoped wake/recovery, metadata-only observations, immutable-image release plan and deployment guard | Staging min-zero/private-worker checks; supervised graph and canary execution; staging recovery-branch read-only schema/data check; actual staging ledger alert email screenshot receipt | Production backup/restore, final image/deployment review, scoped production Invoker grant, private-worker acceptance and authorized activation; other alert paths and incident closure are not proved by one email |
| Developer SDK and MCP | SDK-only MIT package, scoped context/graph interfaces, reviewed-byte OIDC publication and explicit detached first-package handoff; 79 SDK tests, eight independent adversarial cases and actual 18-file pack/consumer check | Disposable native cold activation, in-place auto switch and CodeMode; revoked-grant denial and fail-closed reconnect discovery; real staging SDK graph/receipt replay | Final live SDK denial before grant expiry; live staging native host and untested protocol combinations; owner-approved main artifact/tag, real signing/publication and registry verification |
| Calendar | Session-bound one-use relay, encrypted grants, stable event identity and bounded refresh/revocation handling; two-file feedback integrated/deployed with 19 focused tests and green CI | Real staging consent, one event, workflow read-back plus independent browser observation, natural refresh and completed revocation; renewed active connection and corrected Settings feedback; independent browser reload still shows the same single event | Full independent API inspector and renewed-grant API qualification remain unqualified; identity/ownership and exhaustive session/log assertions must not be inferred |
| Optional product model | Explicit selection/disclosure, closed decision adapter, immutable facts, durable zero-default lifetime admission | Ten synthetic live DeepSeek evaluations; **one completed paid product canary**, exact approved internal follow-up and verified receipt; model disabled/key bindings removed afterward | No further paid invocation implied; broader disclosure/consent, retention and production review remain owner gates; production stays model-disabled |
| Broader agent workflows | Private versioned context, lexical retrieval/original offsets, typed context-task tool, dependency/conditional/not-before graphs and SDK/MCP/example/UI | Staging v1/v2 context/hash browser reads; three-node graph: two tasks, one no-effect false skip, stable IDs/receipt replay and independent task read-back | Final live SDK denial remains open; exhaustive live recovery/timer/retention/role/narrow-screen acceptance is not claimed |

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
| Security/backend source | `59320f31b3e6708050a2a17516ae967d39fe4d9f`; [security CI run 38694392903](https://github.com/udochukwu-echefu/lenslayer/actions/runs/38694392903); **267 offline + 146 real PostgreSQL = 413 passed identities**. Coordinator reports no backend changes since this source |
| Current staging backend image | `europe-west1-docker.pkg.dev/lenslayer/lenslayer/platform-staging@sha256:b5888edb70c1db3468b9937e43db41641a8fef955573aca9c258c9867ee42233`, bound to security/backend source `59320f31…` |
| Canary runtime → disabled runtime | API `lenslayer-api-staging-00006-rqx` → **`lenslayer-api-staging-00007-hrc`**; worker `lenslayer-agent-worker-staging-00006-ll8` → **`lenslayer-agent-worker-staging-00007-nhr`**. Before/after metadata binds both revisions to the same `b5888edb…` image; disable finished by **06:59:08 UTC** |
| Current staging dashboard | Source `e26d3769…`, Worker version **`0eb47238-51c8-45d8-a474-065a9eae31fb`**, observed **07:45:16 UTC**; 19 focused Calendar tests, lint/build/deploy passed. Next **16.3.8**, OpenNext **1.20.11**, supported webpack build via isolated build-command override; server secrets preserved |

The security changes refresh locked agent authority before retained-context reads
and reject terminal/revoked runs at the last paid-provider HTTP boundary after
durable charge. They are **committed and CI/image-bound**, not the uncommitted
candidate described by the superseded draft. The current head, previous green CI
and backend-image source are separate boundaries; do not relabel the backend image
as a build of `80f74dc6…` or `e26d3769…`. Calendar feedback CI is independently
recorded above; that source did not change the backend.
No CI or deployment was re-queried by this documentation review.

Historical bindings remain useful, but are superseded for current runtime:

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

The integrated SDK handoff implementation passed **79 offline tests**, the actual
**18-file pack-and-consumer check**, and **eight independent adversarial cases**.
The independent checks ran again on patched **Sigstore 4.1.1**. These are source
and local-artifact results; real signing/publication requires the owner gates below.

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
staging/native-host acceptance**, does not qualify arbitrary hosts/protocols and
does not close the separate live SDK denial gap below.

## Completed real staging context-graph check

The supervised SDK check ran **06:19:37–06:20:07 UTC on 15 October**, run
`61a7a27d-b5e8-4736-aa11-b235d0c4d92f`. It produced **two succeeded actions and
one cancelled false-branch action**, stable original action/input/output IDs, and
completed-receipt ID stability across the single supported replay. Independent
task metadata read-back found exactly the two expected tasks and **no task at the
false branch's reserved output ID**. This is no-effect skip proof, not a third task.
The queue was paused afterward; production was unchanged.

**Still unverified:** the exact live SDK read denial after owner revocation and
**before the temporary grant expired**. The owner revoked it, but the helper's
hidden confirmation timed out. Its subsequent TTY/timeout fix was reviewed and
passed **52 local tests**; the live graph was not repeated. Revocation metadata,
disposable-host 401s and fail-closed reconnect discovery cannot substitute for
that missing live denial. Never reuse the expired/revoked credential, replan the
completed graph or manufacture retroactive pre-expiry evidence.

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
- An independent Google UI reload after reconnect still showed **one event with
  the same preallocated event identity**, with no second write/event. This is
  browser-observation evidence, **not renewed-grant API qualification**. The renewed
  connection has not been separately provider-qualified; no new API dispatch,
  read-back or final disconnect is implied by stored consent or unchanged UI.

**The full independent API inspector harness is not qualified.** No separate
inspector OAuth project/grant was created, and independent browser observation is
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
- **Recovery:** the staging-only recovery branch had a successful read-only
  schema/data check and autosuspended compute. Its recorded expiry is
  **16 October 2026 00:00:52 Africa/Lagos**. That does not constitute a production
  recovery point or completed production backup/restore; the owner must review
  retention/expiry without treating a staging branch as production protection.
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

The **22-file SDK handoff implementation is integrated and independently reviewed**.
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
are not claimed. The frozen reviewed SDK bytes match the integrated source.
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

1. **Review and merge:** retain exact source/CI/runtime attribution, including
   successful CI **38700202218** for the deployed Calendar feedback. SDK source and
   dependency reviews are complete and integrated; verify the current PR checks,
   then obtain explicit PR #5 review and merge approval. Preserve completed staging
   action evidence while reviewing the final source.
2. **Close only genuine staging gaps under separate authorization:** final live
   SDK denial before grant expiry needs a suitable new authorized fixture, not
   reuse of the expired graph key. Separately qualify renewed Calendar consent
   and the full independent inspector if required, remaining session/log checks,
   live native-host integration and broader recovery/retention/role/UI cases.
   Completed graph/canary/event/email proofs remain completed but bounded.
3. **Production recovery and deployment:** after approved main merge, build and
   review the exact final source/image/deployment plan; verify production backup
   and restore, final scoped invoker grant and private min-zero worker behavior.
   Only then separately authorize migration, private acceptance, traffic promotion
   and wake/recovery activation. Production remains unchanged until those gates.
4. **Public SDK release:** obtain canonical main artifact and tag, approve public
   Sigstore signing and environment review, have the owner publish the exact
   tarball/bundle with provenance for first bootstrap, then verify actual registry
   bytes/signatures/provenance. Package-specific trusted publisher configuration
   is a future OIDC gate. No signing/publication/main merge has occurred here.
5. **Preserve spending and pause controls:** do not reset reservations, issue a
   replacement canary, retry uncertainty or widen grants. Keep model disabled and
   queues/recovery paused absent their own activation approval; inspect existing
   recovery jobs before update/resume rather than relying on create-if-absent.

The [worker operations runbook](../deployment/agent-worker-operations.md) governs
scale-to-zero and recovery. Request-based CPU/minimum zero saves idle compute,
not database/storage, queue/recovery, cold-start or actual job costs. No empty
polling worker is an acceptable workaround. Rendered gate labels and a legacy
pipeline's active-queue prerequisites are **not** authorization or automatic
enforcement of release/production gates.
