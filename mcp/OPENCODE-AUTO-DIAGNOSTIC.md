# OpenCode 2.0.18 auto-protocol investigation — 2026-10-15

## Outcome and evidence boundary

**No adapter wire failure reproduced. A subsequent fresh native auto host passed;
in-place protocol switching remains unqualified.**
No adapter source was changed. No OpenCode host or model request was started in
this investigation. The earlier real-disposable-API legacy result is unchanged.
The zero-call auto session alone cannot distinguish absent tools, permission
filtering, stale registration, hooks/provider filtering, or model non-selection.

`tests/opencode-protocol.test.mjs` now exercises the **2.0.0 MCP client/core pinned
by OpenCode 2.0.18**, as well as our existing 2.3.1 client, against the actual
`dist/stdio.js` child and a synthetic loopback API. Each client passes:

- Legacy, auto and pinned `2026-07-28` negotiation (era explicitly asserted).
- Identical full tool definitions across those three protocols, with all five
  supported version-1 grants; unique, valid normalized tool names.
- `runs.list({limit:1})` with OpenCode session `_meta` and progress options;
  successful text and structured output; fresh grants before the read.
- Changed-grant rediscovery and restoration, then same-connection revocation:
  `isError`/`http_401`, no underlying read, failed subsequent discovery.

The third new test verifies the parent fixture through client 2.0.0 in auto mode.
These are **official-client wire tests**, not execution of OpenCode's registry,
Code Mode, permission engine, provider serialization or a real tenant API.

Reproduce without OpenCode/model/auth access:

```sh
npm --prefix sdk ci --ignore-scripts --no-audit --no-fund
npm --prefix mcp ci --ignore-scripts --no-audit --no-fund
npm --prefix mcp test
```

## Subsequent coordinator acceptance

After the source investigation, the coordinator started an authenticated native
OpenCode 2.0.18 host directly with `protocol: auto`, the complete `codemode: false`
entry and GPT 6.1 Sol/high pinned for build, title, summary, compaction, explore
and general. Following connection, a bounded one-second registry settling period
preceded the request. Actual model tool traces against a real disposable API
proved `lenslayer_runs_list` returned data, cross-tenant `lenslayer_runs_status`
failed with `http_404`, and a same-host read after owner revocation failed with
`http_401`. No worker, provider effect or funded product model ran. The host was
stopped and its port verified closed.

This qualifies the fresh-host auto path, not an in-place legacy/auto transition,
cold filesystem activation, Code Mode, staging API or reconnect after revocation.
The retained earlier entry also included `codemode: false`; its omission is not
the cause of that recorded failure. Settling is a source-informed procedural
change, not proof of a causal registry-race diagnosis.

## Version-pinned source findings

Primary source: upstream tag `v2.0.18`, commit
[`cd9a14a6b688d4021bee381dfd39d2cef9c0f862`](https://github.com/anomalyco/opencode/tree/cd9a14a6b688d4021bee381dfd39d2cef9c0f862).
This is a tag-source investigation, not verification that an installed binary
has no downstream patches. Paths below are relative to that commit:

1. **Protocol does not choose Code Mode.**
   [`packages/core/src/mcp/client.ts:313`](https://github.com/anomalyco/opencode/blob/cd9a14a6b688d4021bee381dfd39d2cef9c0f862/packages/core/src/mcp/client.ts#L313)
   maps `auto` to SDK `mode: auto`, legacy to the initialize default. Both eras
   use the same `listTools`, `callTool` and result conversion. Its dependency is
   client/core 2.0.0 (`packages/core/package.json`); our previous tests only used
   2.3.1. The new matrix closes that wire-test gap, not native host acceptance.
2. **A partial PUT can silently change the exposure mode.**
   `packages/server/src/handlers/mcp.ts:33` passes `payload.config` to `Mcp.add`.
   `packages/core/src/mcp/index.ts:491,626` replaces the server configuration;
   this is not a merge with the old entry. In
   `packages/core/src/tool/mcp.ts:45`, omitted `codemode` means true. In
   [`packages/core/src/tool.ts:234–250`](https://github.com/anomalyco/opencode/blob/cd9a14a6b688d4021bee381dfd39d2cef9c0f862/packages/core/src/tool.ts#L234),
   Code Mode tools are excluded from direct definitions and `execute` is hidden
   by a final matching deny rule. Therefore the documented deny-all smoke rules
   plus an entry lacking `codemode: false` can yield a connected MCP server with
   **zero usable provider tools**, even if `lenslayer_runs_list` is allowed.
   This is a source-established mechanism, **not a claim that the prior PUT
   omitted that field**. Parent must inspect its retained in-memory config.
   Keep `codemode: false`; do not widen `execute` permissions to test protocol.
3. **Connected is not a registry-readiness barrier.**
   `packages/core/src/mcp/index.ts:448` sets connected after catalog loading, then
   publishes `ToolsChanged`. In
   [`packages/core/src/tool/mcp.ts:130–144`](https://github.com/anomalyco/opencode/blob/cd9a14a6b688d4021bee381dfd39d2cef9c0f862/packages/core/src/tool/mcp.ts#L130),
   registry reload is debounced 100 ms. `flush` awaits only the initial fiber.
   `packages/core/src/session/context.ts:127–134` awaits that initial flush before
   taking the request snapshot, not subsequent reconnect updates. An immediate
   session after a protocol switch can therefore observe stale/empty registry
   state. A delay alone is not proof that the event/reload actually occurred.
4. **Cold `mcp.list` is a server list, not a tool catalog.**
   `packages/server/src/handlers/mcp.ts:15–25` returns names/status, not tools.
   `packages/core/src/mcp/index.ts` starts with empty state; config comes from
   `packages/core/src/config/plugin/mcp.ts:38–39`. Plugin activation is forked
   (`packages/core/src/plugin/supervisor.ts:226–236`); `servers()` does not wait
   for it. A single cold empty response does not establish discovery failure.
   Persistent emptiness could instead be config/plugin loading or location
   selection. A native PUT bypasses config population, so its success does not
   prove cold filesystem discovery. No exact cold-host cause was reproduced here.
5. **Names and caches are separate layers.**
   `packages/core/src/tool/runtime.ts` normalizes dots to underscores;
   `runs.list` becomes direct `lenslayer_runs_list` or Code Mode
   `tools.lenslayer.runs_list(...)`, not `tools.lenslayer.runs.list(...)`.
   The adapter's advertised names are collision-free under those rules in the
   all-grants fixture. Host `entry.tools` is cached until reconnect/list-change;
   the adapter does not advertise tool-list-change subscriptions. This is why
   stale grants may remain visible while each actual call still fails closed.
   Host rendered Code Mode catalog is invalidated on registry notify
   (`packages/core/src/tool.ts:207`), so it is not evidence of a protocol-only
   cache key defect. Request definitions can also change in session hooks
   (`packages/core/src/session/model-request.ts:228–255`).

The current [V2 MCP documentation](https://opencode.ai/v2/docs/mcp-servers)
(read 2026-10-15) agrees on names, `codemode` defaults and protocol selection.
It is not authority for the installed 2.0.18 policy schema. Continue using the
installed `/openapi.json` and the qualifications in [OPENCODE.md](OPENCODE.md).

## Bounded, metadata-only parent procedure (not run here)

Use only the parent's approved **same foreground host**, authenticated request
closure and smoke location. Do not invoke `opencode api`, service discovery,
another host, model, prompt, title, compaction, generation or tool execution.
Never inspect auth stores, inherit real LensLayer credentials into this fixture,
or save headers, config bodies, tool schemas, session text or raw debug logs.

1. Parent reviews the installed OpenAPI in memory. Validate the read-only paths
   and native `data` wrappers below against that schema. Project only the
   allowlisted metadata; don't dump the OpenAPI/effective config. Confirm host
   version and that every request uses the identical `location[directory]`.
2. Use this **complete replacement entry**, changing only approved absolute paths:

   ```json
   {
     "type": "local",
     "command": ["/absolute/path/to/node", "/absolute/path/to/mcp/tests/opencode-auto-fixture.mjs"],
     "environment": {},
     "protocol": "auto",
     "codemode": false,
     "disabled": false,
     "timeout": { "startup": 3000, "catalog": 3000, "execution": 5000 }
   }
   ```

   The fixture uses the real adapter factory/SDK transport with an injected
   in-memory API. It neither loads environment credentials nor contacts an API.
   Only synthetic discovery and empty-list reads are implemented; other routes
   return 403. Its stderr is fixed event/count or tool/outcome metadata. No
   human approval, provider access or worker exists. This is not live acceptance.
3. For a separately approved cold-discovery check, parent puts that entry under
   `mcp.servers.lenslayer` in its new restricted smoke directory **before its own
   host launch**. Keep all model providers denied, unrelated MCP entries disabled
   and warming/auto-compaction off. First poll `GET /api/mcp` on that same host:
   at most **20 requests, 250 ms apart, 5 seconds total** (abort at the wall-clock
   deadline; each request also times out after one second), retaining only
   `{sample, lenslayerPresent, status}`. Query `GET /api/plugin` once and retain
   only presence/status for `opencode.config.mcp`. An immediately empty server
   list that later populates isolates startup timing; persistent absence with
   no fixture-discovery event points before the adapter. Do not keep retrying.
4. If needed and separately approved, the parent can register the complete entry
   through its already qualified `PUT /api/experimental/mcp/lenslayer` with JSON
   `{ "config": <entry> }`. This is an explicit host-local mutation, not a GET
   diagnostic. Keep the exact config in memory; retain only protocol and
   `codemode === false`. Repeat with legacy by changing **only** protocol, then
   auto again (at most three registrations total). Allow at most five seconds
   per connection. Do not register unrelated entries or change global config.
5. Public `GET /api/mcp` cannot tell whether provider tools were registered.
   `/api/session/{id}/context` is message history, not a tool-list endpoint.
   If parent has a separately approved in-process diagnostic build, sample the
   following **without running `execute` or preparing/sending a model request**:

   - MCP layer: target-server tool count, `runs.list` present, negotiated era.
   - `Tool.list()`: target namespace count, `lenslayer_runs_list` present,
     its `options.codemode === false`.
   - `Tool.snapshot(effectivePermissions)`: definition count, exact
     `lenslayer_runs_list` presence, `execute` presence, Code Mode catalog count.
     Use the actual selected agent + session permission merge; no fabricated
     allow rules. Sample just after connection and after 250 ms, 1 s and 2 s.

   Do not add an unprotected debug endpoint or print full objects. No such
   instrumentation is installed by this patch. If only the binary/public HTTP
   API is available, report **BLOCKED: registry metadata unavailable** instead
   of sending a model prompt to guess tool visibility.
6. Interpret the earliest difference: MCP absent = startup/config/connection;
   MCP present but registry absent/stale = registration/reload; direct tools
   absent with Code Mode true and `execute` denied = exposure/permissions;
   identical settled direct definitions in both protocols = no protocol failure
   at this boundary. Hooks/provider request shaping and model selection remain
   untested. Close/disconnect the parent's fixture and discard in-memory bodies.

Only after metadata parity and separate authorization should the parent repeat
the real API model-mediated check with GPT 6.1 Sol/high and observed native
`data[].content[]` tool `name`/`state` traces. Do not reuse a revoked credential,
treat MCP `isError` as native success, or count a textual claim as a tool call.
