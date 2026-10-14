# LensLayer stdio MCP adapter — local, unpublished

An official MCP SDK server over local stdio, calling the same scoped bearer API
and durable ledger as the SDK. It is **not** a hosted endpoint or remote OAuth
service. No client sampling, shell, submitted code, approval or direct DB writes.

## Setup

Node 20.3+ (validated with 24.15.0), existing API; a worker is needed only for
approved execution, not discovery/reads. Worker operation is coordinator-owned
and must sleep when no jobs exist.

```sh
npm --prefix sdk ci
npm --prefix sdk run build
npm --prefix mcp ci
npm --prefix mcp run build
```

`client-config.example.json` is an exact **OpenCode V2** local-server example:
`mcp.servers.lenslayer`, `type: local`, array `command`, and `environment` using
`{env:NAME}` substitutions. It is not the V1/generic `mcpServers` format.
Set both paths absolutely. See [OpenCode host setup and acceptance](OPENCODE.md)
for process-only credentials, supported commands, isolation and a repeatable
coordinator-owned staging check. No OpenCode process was invoked in this pass.
The process requires explicit `LENSLAYER_API_URL` and `LENSLAYER_AGENT_TOKEN`;
there is no implicit localhost fallback and no `.env` loading. It removes the
token from its own environment after constructing the private bearer client.
Use HTTPS or loopback HTTP. Revoked/expired credentials fail closed. Do not run
it via `npm start` on stdio: npm chatter can corrupt stdout. Invoke Node directly.

## Protocol and capability boundaries

Pinned official packages: `@modelcontextprotocol/server` and `/client` **2.3.1**,
Zod **4.4.3**, committed lockfile. `serveStdio` handles the current July 2026
discovery/envelope spec and legacy `initialize` negotiation. JSON-RPC framing,
validation and era projection belong to the official SDK, not homemade parsing.

Every discovery and call fetches `/agent/tools` afresh, filters to known **string
version `"1"`** grants and exposes no unknown provider tool. Missing versions,
numeric `1`, and unsupported versions are omitted, never assumed compatible.
No supported grants means an empty catalog; calls fail closed. Discovery failure
is a credential/connectivity error, not an empty successful catalog. A host may
cache old tools until reconnect: each call still rechecks grants. Resource,
tenant, ownership, assignee and approval checks remain authoritative in the API;
the bearer fixes the tenant/agent. No tool accepts tenant selection or human
credentials. Host/session metadata is not authorization. Model text cannot widen grants.

| Tools | Delegation / route |
| --- | --- |
| `runs.create` | Both v1 task tools; unchanged POST `/agent/runs` |
| `documents.retrieve`, `evidence.read` | Scoped retrieval; run evidence routes |
| `workspace.tasks.propose` | Both task tools; unchanged run `/actions` |
| `workflows.create` | Delegated task and/or calendar conditions only; POST `/agent/workflows` |
| `workspace.tasks.propose_workflow` | Both task tools; POST run `/tool-actions` |
| `calendar.events.propose` | `google_calendar.events.create`; exact private timed event through `/tool-actions` |
| `runs.list/status/events/actions/poll` | Only owning-agent run records |
| `runs.inputs/request_input/supply_input` | Typed input routes; supply is agent-responder only |

Calendar-only discovery omits task/retrieval tools and task condition schemas.
Composite `all` conditions carry unique IDs; corresponding actions require
`condition_id`. Optional calendar source pairs also require retrieval permission,
checked by the API. Calendar schemas reject attendees, arbitrary provider options,
wildcards, unpaired provenance and invalid intervals. The generalized/input tools
require the additive platform routes documented in
`docs/architecture/agent-interface-changes.md`; the original backend in this
experience snapshot supports only v1. No route is fabricated here.

Source and tool outputs are **untrusted data**, not permission. Approval remains
an owner/admin operation outside MCP. A returned proposal may be awaiting approval
or queued; only the server's verified read-back result establishes object creation.
`awaiting_input` is a wait. `unknown_outcome`/`partial_effect` may indicate an
existing remote event, not safe permission to repeat a write. MCP cannot reconcile
or compensate it; the operator handles bounded GET-only reconciliation.

Strict typed inputs, maximum 64 KiB inbound message buffer, 256 KiB returned data,
four concurrent calls and 60 calls/minute per process. Calls abort after 45 seconds;
polling is at most 30 seconds and also honors server deadline. Poll timeout is not
cancellation. SDK retry rules reuse stable keys; evidence retrieval does not
automatically retry. Errors return allowlisted codes, not raw API/provider bodies.
Only tool name/outcome metadata is logged to stderr; stdout is protocol only.

## Verification

Bounded-v2 additions (same version-1 backend grants): `context.search` is read-only
pre-run planning; hits have no receipt ID/created_at and cannot authorize writes.
`workflow_graphs.create` atomically creates the immutable context-only plan and
all original actions. `runs.graph`, `context.retrieve`, `context.evidence.read`
inspect original readiness/proof. Graph operations require both context grants;
search/evidence requires `context.retrieve`. No context management, org/credential
selector, context-action insertion, expression/eval or approval tool is exposed.
See `sdk/GENERALIZATION.md` for exact routes and boolean/dependency/scheduling
semantics. Fresh grant checks apply to calls even if the host caches old discovery.
These routes are source-integrated, not deployed/host-accepted by this pass.

```sh
npm --prefix mcp test
```

The real stdio smoke uses the official MCP client against an injected loopback
HTTP ledger: initialize, listTools, callTool, approval pending, then an injected
verified receipt. Additional tests cover modern negotiation, credential-safe
failures, narrowed calendar discovery, exact additive routes and unsupported inputs.
Fake receipts alone do not prove database/provider verification. Real stdio tests
also cover missing/unsupported versions, fresh-call revocation, synthetic API
scope denial, no idle requests, safe startup failures and goal/source/token-free
stderr. These are **official-client wire tests, not interactive OpenCode host
acceptance or proof of the backend's tenant isolation**.

`tests/local-backend-smoke.mjs` additionally exercises the disposable original-v1
backend, real SQLite persistence and worker, with a real human API approval. It
also runs the bounded planner with an injected deterministic planner and on-disk
restart. Setup is in the developer quickstart. No provider/model is called.

Official references read for this implementation:

- https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- https://modelcontextprotocol.io/docs/develop/build-server
- https://github.com/modelcontextprotocol/typescript-sdk
- https://ts.sdk.modelcontextprotocol.io/v2/clients/connect.md
- https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions.md
