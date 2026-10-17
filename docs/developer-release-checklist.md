# Developer/product release checklist

Updated **17 October 2026**. See [current public release status](deployment/current-release-status.md)
for the release snapshot. This checklist separates established public releases
from production acceptance still being handled by root.

## Public release facts

- [x] Publish [`@lenslayer/agent-sdk@0.1.0`](https://www.npmjs.com/package/@lenslayer/agent-sdk).
  MIT applies to the SDK alone; MCP/backend/repository are not relicensed.
- [x] Merge core backend [PR #5](https://github.com/udochukwu-echefu/lenslayer/pull/5),
  UI [PR #6](https://github.com/udochukwu-echefu/lenslayer/pull/6) and app domain
  [PR #7](https://github.com/udochukwu-echefu/lenslayer/pull/7).
- [x] Establish **https://app.lenslayer.online** as the canonical dashboard.
  Main has separate Settings pages, Developer guide inside Settings, Runs inside
  Agents and custom select controls.
- [x] Correct repository SDK install/import/status guidance. The npm 0.1.0 tarball
  is immutable and retains its historical README; this is not a new registry release.

## Developer integration checks

- Install `npm install @lenslayer/agent-sdk@0.1.0` in an ESM server-side Node 20.3+
  project. Follow the [SDK README](../sdk/README.md) for actual exports and usage.
- Obtain an operator-supplied backend API URL and owner/admin-issued scoped
  `ll_agent_` credential. The dashboard URL is not the SDK API base URL.
  Never use a user JWT or expose credentials in browser code/public environment
  variables, source control or logs.
- Start with `client.tools()` to inspect available grants. API methods do not
  imply a grant or provider readiness. Human approval, evidence, fixed scope,
  deadlines and idempotency still apply; the SDK cannot self-approve.
- For source changes, run `npm ci`, `npm test` and `npm run release:check` from
  `sdk/`. These are local build/test/package checks, not live acceptance or
  publication authorization. Keep MCP local stdio; no hosted MCP OAuth is promised.

## Current production work — root owns private configuration and live checks

- [ ] Finish the one approved production task end to end; retain the exact approval,
  action and verified read-back receipt. No new production success is claimed here.
- [ ] Finish production DeepSeek planning configuration, data-transfer/retention
  consent and bounded acceptance. Preserve spending/admission records; staging
  evaluation/canary evidence is not a new paid-call approval or production proof.
- [ ] Finish production Calendar configuration, human consent and provider/session
  acceptance. On uncertain writes use read-back reconciliation, not another insert.
- [ ] Retire the old `workers.dev` app address and verify the resulting behavior.
  A merged custom-domain PR alone does not prove retirement.

Only root can close these items from actual approved live evidence. This source-only
documentation update makes no claim about current private configuration, queue/model
state, migrations, worker activation, production CI/image binding or new approvals.

## Historical evidence, not today's pending-gate list

The [14–15 October acceptance record](architecture/agent-roadmap-acceptance-2026-10-14.md)
preserves original test counts, fixture identities, staging results and limitations.
It records the fresh SDK pre-expiry revocation denial and renewed Calendar
existing-event GET/natural refresh as completed bounded staging proofs. Do not
reopen those checks based on older unchecked checklist entries.

Its draft PR #5, unpublished SDK and first-package bootstrap status is superseded
by the public release facts above. Other historical unchecked items are not
automatically current blockers or automatically passed: the release operator must assess relevance
and retain source/runtime-specific evidence. A merge or npm listing does not prove
cryptographic provenance verification, exhaustive operational/security acceptance,
or production task/model/Calendar success. Future registry releases require their
own owner review; see the [distribution procedure](../sdk/DISTRIBUTION.md).
