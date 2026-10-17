# Current public release status

As of **17 October 2026**, combining public release facts, registry metadata and
the release operator’s sanitized production checks. The specific observations
below distinguish the completed synthetic Calendar task from a public Calendar launch.

| Area | Current status |
| --- | --- |
| SDK | [`@lenslayer/agent-sdk@0.1.0`](https://www.npmjs.com/package/@lenslayer/agent-sdk) is published. MIT applies to the SDK only, not the backend or whole repository. |
| Merged source | Core backend [PR #5](https://github.com/udochukwu-echefu/lenslayer/pull/5), UI [PR #6](https://github.com/udochukwu-echefu/lenslayer/pull/6), app domain [PR #7](https://github.com/udochukwu-echefu/lenslayer/pull/7) and provider pilot/guarded release [PR #8](https://github.com/udochukwu-echefu/lenslayer/pull/8) are merged. Merge is not migration, activation, runtime/provider acceptance or old-host retirement evidence. |
| Dashboard | Canonical URL: **https://app.lenslayer.online**. Main has separate Settings pages, the Developer guide inside Settings, Runs inside Agents and custom select controls. |
| Production task | The original model-assisted proposal expired without dispatch. After the owner explicitly authorized a restart and the exact event, a fixed-workflow Calendar-only assignment succeeded with one dispatch and a matching Google Events GET receipt. Independent Google Calendar search showed exactly one matching private event. |
| Production model | The private DeepSeek pilot is enabled with a durable **USD 1 total / three-admission ceiling**. One production assignment completed its decision gate with exactly one recorded model call and one **USD 0.319488 conservative reservation**. This reservation is capacity accounting, not a measured provider bill. The approved restart used fixed-workflow planning and made no additional paid model call. The original model proposal was accepted but its action approval expired; it is not recorded as a completed model-assisted run. |
| Production Calendar | One owner-only pilot connection is stored, with exact `calendar.events.owned` scope, browser-session binding and a disposable owned-calendar target independently checked. The exact synthetic event passed provider read-back and an independent Calendar UI check, including its title, times, target calendar and private visibility. Its dispatch intent had no attendees, reminders or recurrence. Google OAuth remains External Testing; this is not a verified public integration. |
| Old app address | The old production `workers.dev` root, sign-in, API proxy and callback paths return **404** without redirects, and the origin is absent from API CORS. The obsolete Auth0 callback was removed and verified after reload; localhost and canonical app allowlists were preserved. Fresh logout and Google sign-in returned the same owner to the selected workspace. Canonical app and separate staging sign-in pages return **200**. |

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
reported zero active and idle worker instances both while the original action
awaited approval and after the successful restart completed. The original task
deferred its next wake to the approval/deadline boundary rather than a short
polling loop. The worker retains min-zero, request-billed CPU, a bounded drain
and private invocation. The provider receipt and persisted dispatch intent bind
the completed event to the approved immutable input; the original expired action
remained cancelled with zero attempts and no dispatch marker. This Calendar-only
acceptance does not establish document-upload acceptance, actual model billing
or a public Calendar launch.

Use the [current checklist](../developer-release-checklist.md) for next actions.
The [14–15 October acceptance record](../architecture/agent-roadmap-acceptance-2026-10-14.md)
preserves dated tests and staging observations. Its draft/unmerged/unpublished
statements are superseded by the release facts above, not by invented new test,
CI, deployment or approval identities. Historical unchecked boxes are not an
authoritative list of current blockers.
