# Server-side agent example

This source-installed, task-only CLI uses the sibling built SDK. It is not a
published npm CLI and adds no new platform APIs. Only the SDK package is MIT;
no repository-wide or example/MCP relicensing is implied.

```sh
npm --prefix sdk ci --ignore-scripts --no-audit --no-fund
npm --prefix sdk run build
npm --prefix examples/agents test
```

Tests now build the SDK first and use injected/disposable data, not providers.
For an authorized run, supply the variables documented in `config.mjs` through
the server process environment, then run `node examples/agents/renewal-follow-up.mjs`.
It never loads an environment file implicitly. Keep the agent bearer on the
server; do not put it in arguments, a model prompt, a browser or logs.

Persist run/action idempotency keys and keep all explicit facts unchanged across
restarts. The CLI checks existing immutable actions before retrieving new evidence;
changing a key is not a safe response to an uncertain effect. Human approval is
outside this client; only authoritative verified read-back establishes completion.
Worker lifecycle/live staging checks are coordinator-owned; idle workers must sleep.

## Context graphs (additive bounded v2)

`node examples/agents/context-graph.mjs /absolute/private/graph.json` submits or
replays one exact immutable graph and reads its original IDs/states. Process-only
API URL and scoped token are required. It never approves, replans, polls or adds
actions. See [the exact graph guide](../../sdk/GENERALIZATION.md) for explicit
context/assignee scope, dependencies, strict factual boolean branches and not-before
times. All facts/IDs/dates come from the authorized caller. Optional `searchContext`
planning hits have no receipt ID and cannot authorize writes; graph creation binds
independent evidence. An all-false graph creates no tasks; a created task is not a
performed business follow-up. Existing renewal example remains task-only/v1.

See [SDK distribution](../../sdk/DISTRIBUTION.md),
[MCP/OpenCode host acceptance](../../mcp/OPENCODE.md), and the existing
[developer quickstart](../../docs/developer-agent-quickstart.md) for task inputs.
Older quickstart/release licensing language is historical: SDK 0.1.0 is now MIT
but remains **unpublished** until the coordinator completes registry acceptance.
