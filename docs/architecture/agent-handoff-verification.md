# Developer infrastructure handoff verification

Reviewed independently in the shared checkout on 8 October 2026. The second
agent's assigned dashboard, SDK, example, and quickstart work is complete for the
current backend contract. This verifies a local developer infrastructure MVP;
it does not establish production readiness or completion of the broader pivot.

## Delivered

- Agents dashboard: tenant-scoped delegation list/create/revoke, owner/admin
  controls, scope/expiry/approval policy, and a credential shown once. The bearer
  remains outside the query/mutation cache and clears when its display is left.
- Runs dashboard: history, exact success condition, execution ownership, source
  inspection, immutable action input/hash, human approval/rejection, cancellation,
  ordered events, persisted result, and failure/denied-access states.
- Signed-out demo records are explicitly synthetic and read-only. They do not
  stand in for executions in a private workspace.
- Local dependency-free TypeScript SDK: typed agent API calls, stable idempotent
  retries, credential-safe errors, bounded polling, cancellation signals, and
  ordered/deduplicated event pagination. It is a server-side package, not a
  browser bearer client or published npm release.
- Runnable environment-configured example: retrieve retained evidence, propose
  an exact assigned task, wait for human approval, and inspect verified completion.
  Restarting with the same configuration/keys reuses the original proposal and
  evidence. Dates and identities are explicit inputs; this is a deterministic
  protocol client, not a hosted model planner.
- [Developer quickstart](../developer-agent-quickstart.md) documents setup,
  credentials, real worker startup, approvals, supported errors, and limitations.

## Independent checks

| Check | Result |
| --- | --- |
| `.venv/bin/python -m unittest discover -s tests -q` | 83 tests passed |
| `npm --prefix dashboard run lint` | Passed |
| `npm --prefix dashboard test` | 113 tests passed |
| `npm --prefix dashboard run build` | Passed, including TypeScript and route generation |
| `npm --prefix sdk test` | Build and 32 tests passed |
| `npm --prefix examples/agents test` | 14 tests passed |
| `git diff --check` | Passed |
| Disposable HTTP API/SDK/worker integration | Passed |
| Browser demo navigation/evidence inspection | Passed |
| Mobile registry/run detail at 390px | Loaded content fits the viewport |

The HTTP integration used `examples/agents/tests/local_backend.py` with its own
SQLite database/storage, a stub document analyzer, disabled email, and no loaded
provider credentials. `examples/agents/tests/verify-local-backend.mjs` exercised
retained upload -> SDK run -> evidence -> human API approval -> actual worker ->
verified task. Run/action replay, event pagination, revocation, and restart of the
runnable example also passed without creating another task.

The initial production build was blocked by the shell sandbox's prohibition on
binding a local port inside Turbopack. The approved execution completed normally.
The browser inspection used the signed-out synthetic workspace. Human approval
was verified through the real local API and component tests; a production OIDC
sign-in/approval session was not exercised in this review.

## Remaining work, in recommended order

1. **Validate the deployed stack.** Apply the additive migration in a staging
   environment, run the worker continuously, exercise real OIDC creation and
   approval, and verify PostgreSQL concurrency/crash recovery. SQLite checks do
   not establish production lock behavior. Add operational run/action metrics and
   review deployment limits against intended usage.
2. **Deliver one live external action.** Choose a customer workflow, implement
   tenant OAuth/credential lifecycle, a typed write, provider receipt/read-back,
   and reconciliation for ambiguous timeouts. The current integration connection
   records do not perform live provider writes.
3. **Expand beyond one contract task.** Generalize resources, typed tools and
   success conditions; add multi-step completion, checkpoints, and missing-input
   pause/resume. Current retrieval is literal phrase matching, and the only
   action/success condition is internal workspace task creation. Broader context
   retrieval and budgets should follow the workflows being supported.
4. **Distribute the developer interface.** Prepare/version/publish the local SDK
   and add an MCP adapter that uses the existing agent authorization and
   run/action ledger. No MCP endpoint exists yet.
5. **Reposition the product.** Update landing-page messaging and onboarding to
   explain the demonstrated infrastructure. The existing experience remains
   centered on contracts; preserve unrelated landing edits during that work.
6. **Add LensLayer-hosted planning.** Build a bounded model-driven runner over
   the same APIs, with missing-input handling and outcome evaluations. This comes
   after the developer action protocol and chosen connector work reliably.

Existing maintenance items: historical Alembic index drift recorded in the
[backend verification](agent-foundation-verification.md), and UTC normalization
of the legacy task-list serializer (the agent result already includes a timezone).
These are separate from the new agent table migration and should be resolved or
explicitly tracked before release. The implementation is currently uncommitted
and has not been deployed by this review.
