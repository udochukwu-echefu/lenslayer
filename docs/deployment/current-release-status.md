# Current public release status

As of **17 October 2026**, combining public release facts, registry metadata and
the release operator’s sanitized production checks. The specific observations
below do not claim a completed end-to-end task or public Calendar launch.

| Area | Current status |
| --- | --- |
| SDK | [`@lenslayer/agent-sdk@0.1.0`](https://www.npmjs.com/package/@lenslayer/agent-sdk) is published. MIT applies to the SDK only, not the backend or whole repository. |
| Merged source | Core backend [PR #5](https://github.com/udochukwu-echefu/lenslayer/pull/5), UI [PR #6](https://github.com/udochukwu-echefu/lenslayer/pull/6), app domain [PR #7](https://github.com/udochukwu-echefu/lenslayer/pull/7) and provider pilot/guarded release [PR #8](https://github.com/udochukwu-echefu/lenslayer/pull/8) are merged. Merge is not migration, activation, runtime/provider acceptance or old-host retirement evidence. |
| Dashboard | Canonical URL: **https://app.lenslayer.online**. Main has separate Settings pages, the Developer guide inside Settings, Runs inside Agents and custom select controls. |
| Production task | One synthetic Calendar-only assignment has produced an immutable event proposal and is awaiting the owner’s per-action approval. Dispatch had not started at the recorded check; no verified event receipt is claimed yet. |
| Production model | The private DeepSeek pilot is enabled with a durable **USD 1 total / three-admission ceiling**. One production assignment completed its decision gate with exactly one recorded model call and one **USD 0.319488 conservative reservation**. This reservation is capacity accounting, not a measured provider bill. Action approval and effect verification remain separate. |
| Production Calendar | One owner-only pilot connection is stored, with exact `calendar.events.owned` scope, browser-session binding and a disposable owned-calendar target independently checked. Event dispatch/read-back remains pending. Google OAuth remains External Testing; this is not a verified public integration. |
| Old app address | The old production `workers.dev` root returns **404** and is absent from API CORS. The canonical app and separate staging sign-in pages return **200**. Removal of the obsolete Auth0 callback still awaits the administrator’s sign-in, followed by fresh authentication checks. |

## Developer entry point

Install `npm install @lenslayer/agent-sdk@0.1.0` in an ESM server-side Node 20.3+
project. Import `LensLayerClient` from `@lenslayer/agent-sdk`; see the
[SDK README](../../sdk/README.md) for a read-only example and credential guidance.
Use an operator-supplied backend API URL and a scoped `ll_agent_` token, not the
dashboard URL or a user JWT. Never send the credential to the browser.

The repository README is corrected independently of the published artifact.
The immutable 0.1.0 tarball still contains its historical unpublished-status
README; this documentation update neither republishes it nor creates a new
registry release. Registry metadata advertises signatures/provenance; this update
does not claim cryptographic verification of them.

## Evidence boundaries

Production read-back matched the reviewed immutable image and exact nonsecret
provider configuration on API and worker. Readiness passed; absent/invalid OIDC
tokens were rejected, private worker access without authentication returned 403,
and all nine dashboard server-secret bindings survived deployment. Cloud Monitoring
reported zero active and idle worker instances while the action awaited approval;
the next queued wakes were at approval expiry, rather than a short polling loop.
These checks do not establish a verified event, post-completion idle behavior or
actual model billing. The worker retains min-zero, request-billed CPU, a bounded
drain and private invocation.

Use the [current checklist](../developer-release-checklist.md) for next actions.
The [14–15 October acceptance record](../architecture/agent-roadmap-acceptance-2026-10-14.md)
preserves dated tests and staging observations. Its draft/unmerged/unpublished
statements are superseded by the release facts above, not by invented new test,
CI, deployment or approval identities. Historical unchecked boxes are not an
authoritative list of current blockers.
