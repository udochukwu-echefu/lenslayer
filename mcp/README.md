# LensLayer stdio MCP adapter — local, unpublished

An official MCP SDK server over local stdio, calling the same scoped bearer API
and durable ledger as the SDK. It is **not** a hosted endpoint or remote OAuth
service. No client sampling, shell, submitted code, approval or direct DB writes.

## Setup

Node 20.3+ (validated with 24.15.0), existing API and continuous worker:

```sh
npm --prefix sdk ci
npm --prefix sdk run build
npm --prefix mcp ci
npm --prefix mcp run build
```

Adapt `client-config.example.json` to your host's local `mcpServers` format.
Use an absolute Node executable/path if the host lacks your shell PATH. Replace
the placeholder through the host's server-side secret mechanism, or a private
0600 configuration file; do not commit it or put a token in a prompt. The process
reads only `LENSLAYER_API_URL` and `LENSLAYER_AGENT_TOKEN`. Use HTTPS or loopback
HTTP. Revoked/expired credentials fail closed. Do not run it via `npm start` on
stdio: npm lifecycle chatter can corrupt stdout. Invoke `node dist/stdio.js`.

## Protocol and capability boundaries

Pinned official packages: `@modelcontextprotocol/server` and `/client` **2.3.1**,
Zod **4.4.3**, committed lockfile. `serveStdio` handles the current July 2026
discovery/envelope spec and legacy `initialize` negotiation. JSON-RPC framing,
validation and era projection belong to the official SDK, not homemade parsing.

Every discovery and call fetches `/agent/tools` afresh, filters to known version-1
grants and exposes no unknown provider tool. Resource/assignee/approval checks
remain authoritative in the API. The host cannot widen grants through model text.

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

```sh
npm --prefix mcp test
```

The real stdio smoke uses the official MCP client against an injected loopback
HTTP ledger: initialize, listTools, callTool, approval pending, then an injected
verified receipt. Additional tests cover modern negotiation, credential-safe
failures, narrowed calendar discovery, exact additive routes and unsupported inputs.
Fake receipts alone do not prove database/provider verification.

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
