# Current public release status

As of **17 October 2026**, based on public release facts supplied for this update
and an unauthenticated npm registry read. This is not live production acceptance.

| Area | Current status |
| --- | --- |
| SDK | [`@lenslayer/agent-sdk@0.1.0`](https://www.npmjs.com/package/@lenslayer/agent-sdk) is published. MIT applies to the SDK only, not the backend or whole repository. |
| Merged source | Core backend [PR #5](https://github.com/udochukwu-echefu/lenslayer/pull/5), UI [PR #6](https://github.com/udochukwu-echefu/lenslayer/pull/6) and app domain [PR #7](https://github.com/udochukwu-echefu/lenslayer/pull/7) are merged. Merge is not runtime acceptance. |
| Dashboard | Canonical URL: **https://app.lenslayer.online**. Main has separate Settings pages, the Developer guide inside Settings, Runs inside Agents and custom select controls. |
| Production task | One approved end-to-end production task remains in progress with the release operator; no new completion or receipt is claimed here. |
| Production model | DeepSeek planning remains in progress with the release operator, including private configuration, consent and acceptance. Historical staging evaluations/canary do not qualify production or authorize another call. |
| Production Calendar | Configuration, human consent and live acceptance remain with the release operator and in progress. Historical staging event/refresh/revocation evidence is not production acceptance. |
| Old app address | Retirement of the old `workers.dev` app address remains in progress with the release operator. Use the canonical dashboard; no shutdown or redirect verification is claimed here. |

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

Use the [current checklist](../developer-release-checklist.md) for next actions.
The [14–15 October acceptance record](../architecture/agent-roadmap-acceptance-2026-10-14.md)
preserves dated tests and staging observations. Its draft/unmerged/unpublished
statements are superseded by the release facts above, not by invented new test,
CI, deployment or approval identities. Historical unchecked boxes are not an
authoritative list of current blockers.
