# LensLayer agent SDK

A server-side TypeScript client for the implemented `/api/v1/agent` API. No runtime
dependencies or framework. Requires Node 20.3+ (the repository uses Node 24.15).
Version 0.1.0 is prepared locally and **not published to npm**. This SDK package
alone is licensed under the [MIT License](LICENSE), copyright 2026 LensLayer.
This does not relicense MCP, the backend, or the repository. The free `@lenslayer`
organization exists per owner status; MFA, first-package bootstrap, trusted
publishing setup and main/artifact release approval remain release-owner gates.

```sh
cd sdk
npm ci
npm test
npm run release:check
```

```ts
import { LensLayerClient } from "@lenslayer/agent-sdk";

// Obtain a scoped ll_agent_ credential from an owner/admin; never use a user JWT.
const client = new LensLayerClient({
  baseUrl: process.env.LENSLAYER_API_URL!,
  token: process.env.LENSLAYER_AGENT_TOKEN!,
});
const tools = await client.tools();
```

For an installed-artifact check, run `npm pack --pack-destination /your/private/package-directory`
from `sdk/`, then `npm install /your/private/package-directory/lenslayer-agent-sdk-0.1.0.tgz`
in a server-side client project. `prepack` builds declarations and ESM exports;
the allowlist contains only seven named ESM modules/declarations, package metadata,
README, LICENSE and changelog (18 files total).
`release:check` runs regression tests, actual archive/credential-pattern checks,
packs a tarball and installs/imports it in a disposable directory. This is not a
publication or a guarantee that an arbitrary future file contains no secrets.
Never import the client into a browser; credentials belong on a server.
The dashboard uses only the SDK's shared wire **types**, not its bearer client.

Methods: `tools`, `listRuns`, `createRun`, `getRun`, `events`, `iterateEvents`,
`actions`, `retrieveEvidence`, `readEvidence`, `proposeAction`, `cancelRun`,
and `pollRun`. Additive methods: `createWorkflow`, `proposeToolAction`,
`requestInput`, `inputRequests`, and `supplyInput`. There is intentionally no
agent self-approval, OAuth provisioning or reconciliation method: those are human
operations. Framework-neutral public exports include wire types, client options,
poll/event options, `isTerminalRun` and safe error classes. ESM-only; no CommonJS
or browser credential client is promised.

Bounded-v2 additions: `searchContext` (pre-run planning hits, never write authority),
`createWorkflowGraph`, `graph`, `retrieveContextEvidence`, `readContextEvidence`.
They freshly check version-1 context grants and keep planning hits distinct from
durable evidence receipts. See the source [context/graph guide](https://github.com/udochukwu-echefu/lenslayer/blob/main/sdk/GENERALIZATION.md)
for exact routes, boolean branches, dependencies, scheduling and acceptance limits.

The unchanged `createRun`/`proposeAction` use task-only v1 routes. Generalized
calendar/composite workflows use `/agent/workflows` and `/tool-actions` via the
additive methods. Discriminate success conditions by `type` and action inputs by
`tool`; calendar inputs are not tasks. `awaiting_input` is nonterminal.
`unknown_outcome` is an action status; a failed run with that error may have
remote effects. `partial_effect` receipts are not rollback or whole-run success.
These additive methods require the platform interface update, not the original
v1-only backend. Live Google OAuth/provider verification is a release gate.

Run, workflow, input-request and action creation require caller-supplied `idempotency_key` values. Default
retries: at most two additional attempts on network failures and HTTP 429/500/
502/503/504, only for reads and these idempotent mutations. The serialized body
is frozen for a request's retries. Immutable input supply can replay the exact same
values; human-responder supply is denied to the bearer client. Evidence retrieval and cancellation are not
automatically retried. HTTP 400/401/403/404/409/422 are never blindly retried.
Each HTTP request has a 15-second timeout; retries use bounded backoff and
`Retry-After` waits capped at five seconds. Redirects are not followed with tokens.

`LensLayerHttpError` exposes `status`, redacted `detail`, and `requestId`.
`LensLayerTransportError` does not retain a potentially credential-bearing fetch
exception. Never log client configuration, environment variables, or headers.

Event pages use `afterSequence` and `limit` (1–200). `iterateEvents` sorts and
deduplicates sequences, rejects a non-advancing full page, and defaults to at
most 100 pages. It reads the current history, not a permanently live stream.
Resume from the last received sequence to read more.

`pollRun` defaults to a five-minute total limit and a two-second interval. It
stops on succeeded/failed/cancelled, the server deadline, an HTTP error, or caller
cancellation. Supply `deadlineAt` when known to also bound the first request.
`PollingStoppedError` distinguishes timeout from deadline; neither means the
run succeeded or was cancelled. Approvals may outlast your polling window.

In the source checkout, see `docs/developer-agent-quickstart.md`,
`docs/developer-release-checklist.md` and `examples/agents/renewal-follow-up.mjs`.
The source-only [distribution guide](https://github.com/udochukwu-echefu/lenslayer/blob/main/sdk/DISTRIBUTION.md)
documents the manual review/publish workflow, exact source/version/tag binding,
SHA-256 and npm integrity verification. The repository documentation and examples
are deliberately not bundled into the npm artifact. Official provenance reference:
https://docs.npmjs.com/generating-provenance-statements
