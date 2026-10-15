# OpenCode V2 local stdio setup and coordinator acceptance

Status: source-installed and wire-tested with local fake APIs. On 15 October
2026, the actual OpenCode 2.0.18 native host completed both legacy and fresh-host auto-protocol
model-mediated reads against a real disposable local API, denied a different
tenant's run (`http_404`), and denied a same-host read after owner revocation
(`http_401`). GPT 6.1 Sol/high was pinned for the model and all helpers.
Staging-host acceptance and in-place protocol switching remain unqualified. Nothing here
installs a remote/cloud MCP provider.
The SDK alone is MIT; this private MCP package remains `UNLICENSED`.

### OpenCode 2.0.18 compatibility warning

The metadata-only diagnosis on 14 October 2026 invoked the installed
**2.0.18** CLI, not a model. Its own `/openapi.json` differs from the current V2
website: top-level `policies`, `integration.use` and `tool.use` are not supported
there. It accepts `experimental.policies` with actions `provider.use` and
`permission`. Do not assume current website policy examples protect 2.0.18.

Native `mcp.servers` configuration is accepted, but the tested cold
`opencode api --standalone mcp.list --param location.directory=...` returned an
empty server list and did not spawn a credential-free, official-client-verified MCP
fixture. Git initialization, `protocol: auto` and explicit built-in plugin
selection did not establish discovery. The subsequent native host check connected
LensLayer through `PUT /api/experimental/mcp/lenslayer`, with the smoke directory
as `location[directory]` and the local entry as the JSON `config`. This must be
the same foreground host used for the session. Its observed HTTP challenge uses
Basic authentication with username `opencode`; the generated server password
stayed in coordinator process memory and the loopback host was stopped afterward.
Never put that password in CLI arguments, saved logs or configuration.

The accepted local entry used the existing absolute Node executable and
`environment: {}`; the explicitly injected process environment supplied the API
URL and scoped synthetic token to the child. Confirm executable paths exist.
The legacy protocol produced real tool traces. Switching that host to `auto`
connected its catalog but produced no model tool trace. A later fresh host
started directly in `auto`, retained the complete `codemode: false` entry and
allowed the debounced registry one second to settle. Its actual tool traces
passed the same read, tenant denial and revocation checks. This qualifies that
cold auto path; it does not diagnose or qualify the earlier protocol switch. See the
[acceptance record](../docs/architecture/agent-roadmap-acceptance-2026-10-14.md).

The [2026-10-15 auto investigation](OPENCODE-AUTO-DIAGNOSTIC.md) adds real-stdio
parity tests using OpenCode 2.0.18's pinned MCP client 2.0.0, plus a credential-free
parent fixture and bounded metadata-only procedure. No wire failure reproduced.
The subsequent coordinator-owned fresh-host auto acceptance is recorded there. A native PUT replaces the whole entry:
preserve `codemode: false` when switching protocol. Omitting it enables Code Mode,
whose `execute` tool is denied by the restrictive smoke permissions below.
Connected status alone does not prove the host's debounced tool registry is ready.

## Build and configure

From this source copy, with Node 24.15.0:

```sh
npm --prefix sdk ci --ignore-scripts --no-audit --no-fund
npm --prefix sdk run build
npm --prefix mcp ci --ignore-scripts --no-audit --no-fund
npm --prefix mcp run build
npm --prefix mcp test
```

Both sibling directories are required (`file:../sdk`). There is no published
`npx @lenslayer/agent-mcp`, hosted MCP URL, remote OAuth flow or agent self-approval.
Use `node /absolute/path/to/mcp/dist/stdio.js`, never `npm start`, `npx`, or a shell
command containing a literal token. Absolute executable/entrypoint paths work
without shell PATH expansion.

Copy [`client-config.example.json`](client-config.example.json) into a **new
coordinator-approved smoke directory** as `opencode.json`, replacing only the two
absolute paths. It uses native V2 `mcp.servers`, not V1 `mcp` or generic
`mcpServers`. OpenCode substitutes `{env:NAME}`, not `$NAME`. `protocol: legacy`
uses initialize negotiation; repeat with `protocol: auto` to probe current
2026-07-28 discovery. `codemode: false` exposes tools directly and makes host
acceptance easier to inspect. Code Mode is host-side and requires separate host
qualification/permissions; the adapter does not consume/trust the OpenCode `_meta`
session ID.

Interactive coordinator commands (separate from the tested native API path):

```sh
opencode --standalone /absolute/path/to/smoke-directory
opencode mcp list
```

Run `mcp list` **from the smoke directory in the same approved process context**;
a separate command can start its own service. In the private interactive host,
use **`/mcps`** to inspect/connect/disconnect LensLayer. The CLI can instead create
the basic local entry using `opencode mcp add lenslayer -- /absolute/path/to/node
/absolute/path/to/mcp/dist/stdio.js`; environment, protocol and timeouts still
require the example configuration. This is local stdio, so `mcp auth` and OAuth
sign-in are neither needed nor supported for LensLayer.

### Restrict the smoke host before connecting

OpenCode merges global, ancestor, `.opencode`, system/managed and Console config;
a new directory or `--standalone` **does not erase inherited configuration**.
Have the coordinator inspect the effective configuration through approved host
controls (not secret dumps). Do not use this repository's root `opencode.json` as
the smoke configuration or import unrelated MCP/cloud providers.

For a dedicated smoke project, merge these native V2 settings into the copied
example **before launching it**. This block uses the policy shape confirmed in
the installed 2.0.18 schema (schema preservation was tested, not live enforcement):

```json
{
  "snapshots": false,
  "compaction": { "auto": false },
  "warming": false,
  "permissions": [
    { "action": "*", "resource": "*", "effect": "deny" },
    { "action": "lenslayer_runs_list", "resource": "*", "effect": "ask" },
    { "action": "lenslayer_runs_status", "resource": "*", "effect": "ask" }
  ],
  "experimental": {
    "policies": [
      { "action": "provider.use", "resource": "*", "effect": "deny" }
    ]
  }
}
```

On 2.0.18 this is **not an integration-loading allowlist**. Disable every unrelated
MCP entry explicitly and verify the effective configuration through approved
metadata-only controls. Do not infer `permission` policy resource semantics from
the newer `tool.use` syntax. The current website documents top-level `policies`
and `integration.use`/`tool.use` for newer builds; use those only after the actual
host's schema and enforcement are verified. No global config/auth change is needed
or authorized by this guide.

This discovery-only phase allows **no model requests**, shell, reads, delegation,
web tools, other MCP servers, skills or optional plugins. Broader/system policies
can override project policy; built-in policy/Console plugins cannot all be
disabled. If effective restrictions cannot be established, stop rather than
running under an existing broadly privileged host.

For a separately authorized **model-mediated tool call**, the coordinator must
permit only its already approved `openai` provider (append a `provider.use`
`openai` allow in the host-supported policy field), select the catalog's **GPT 6.1 Sol/high**, and bind all used
agents/helpers (`title`, `summary`, `compaction` as applicable) to that same model
and variant. V2 agent `model` selectors support `openai/gpt-6.1-sol#high`; confirm
the exact catalog entry exists before use. Root `model` alone does not retain a
variant and an unavailable default can fall back. **Do not substitute models. If
quota is exhausted, another saved account requires the coordinator's prior
authorization; otherwise stop and report QUOTA.** Keep warming
and automatic compaction off, do not invoke subagents, and verify helper settings
before sending even the first prompt. Model costs and this acceptance remain
coordinator-owned, not part of `npm test`.

### Process-only credentials

An owner/admin supplies an expiring **staging agent** credential with the smallest
supported tool/resource delegation; use synthetic staging records only. Do not
use human JWTs, provider API keys, subscription credentials, production accounts
or broad workspace administration. A separate human session owns provisioning,
revocation and approvals; those credentials never enter the MCP process.

Use the coordinator's existing process-secret launcher to inject
`LENSLAYER_AGENT_TOKEN` and explicit `LENSLAYER_API_URL` into this **private host
process**, which passes them through `environment` to the MCP child. No `.env`,
token-bearing config, CLI argument, prompt, saved shell history or debug dump is
needed. For a coordinator-operated Bash terminal, a process-memory-only pattern
is below. It prompts without echo, keeps shell tracing off, and never puts the
token literal in history; the approved binary and URL must be supplied first:

```bash
(
  set +x
  read -r -s -p 'Scoped staging agent token: ' LENSLAYER_AGENT_TOKEN
  echo
  export LENSLAYER_AGENT_TOKEN
  export LENSLAYER_API_URL='https://YOUR-AUTHORIZED-STAGING-API'
  /absolute/path/to/opencode --standalone /absolute/path/to/smoke-directory
  unset LENSLAYER_AGENT_TOKEN LENSLAYER_API_URL
)
```

This is **process scoping, not a sandbox against the host**: OpenCode and its
children can initially read inherited environment. The MCP entrypoint deletes
the token from its own environment after creating the private client, but cannot
remove the parent's copy or guarantee OS memory erasure. Trust the host/operator;
deny arbitrary shell/read/plugin access and close the private host afterwards.
OpenCode may retain tool results/transcripts: use synthetic data, no customer
goals/source, no debug/trace/session export, and no raw logs/screenshots in reports.
LensLayer stderr contains only fixed event codes or tool-name/outcome metadata;
stdout is MCP protocol. API outputs necessarily reach the host/model on calls.

## Repeatable authorized staging acceptance

Record host/Node/adapter versions, source SHA, protocol, server name and only
non-secret counts/error codes in a private coordinator evidence record.

1. Confirm the explicit staging API URL, authorized synthetic tenant A/agent A,
   credential expiry, resources, approval policy and read-only smoke permission.
   No worker needs to run for this discovery/read test. Do not activate cloud
   workers or change their idle/sleep settings for MCP discovery.
2. Start the restricted private host. In `/mcps`, confirm **only LensLayer** is
   connected. Inspect tool discovery: string-version-1 grants only; no approval,
   reconciliation, OAuth, arbitrary execution or shell tool. For task delegation,
   both document retrieval and task creation are required for task proposals.
3. With separately approved model cost, send exactly: “Call
   `lenslayer_runs_list` with `limit: 1` once. Report only whether the call succeeded
   and the number of records. Do not print records, goals, source, configuration,
   credentials or environment. Do not use other tools or delegate.” Approve once,
   not always. Observe the host's actual tool-call trace. A model claiming it
   called a tool without an observed call is not a pass.
4. Use a prearranged synthetic tenant-B run ID (not customer data) with
   `lenslayer_runs_status` once. Expect API ownership/scope denial (`http_403` or
   `http_404`), no B record and no widened tool arguments. Do not guess IDs. This
   is the live tenant check; local fake-API tests only verify denial propagation.
5. The owner/admin revokes A through the existing human interface. Without
   reconnecting, repeat the previously allowed read: the fresh `/agent/tools`
   check must fail (`http_401`/`http_403`), before the underlying read. Reconnect
   through `/mcps`: discovery must report delegation unavailable, not restore
   cached grants. An old host catalog can remain visible until reconnect, but
   must never authorize another operation.
6. Close that host; obtain a new narrowly scoped credential only if authorized.
   Repeat initialize/discovery/read once with `protocol: auto`. Never reuse the
   revoked token. Report legacy and current-protocol outcomes separately.
7. Missing/unsupported tool-version discovery is repeatable locally via
   `npm --prefix mcp test` (real stdio, missing version, `"2"`, numeric `1`, unknown
   name). **Do not alter staging discovery or invent grants** to force it. A live
   host version-mismatch test requires a coordinator-approved fixture/version
   rollout. Record this case as local-wire-only until exercised through the host.
8. Revoke remaining smoke credentials, disconnect LensLayer, exit the private host,
   and verify no smoke processes remain. Keep only redacted outcome evidence.

This sequence deliberately performs **no creation/proposal/provider writes**. A
separately approved end-to-end execution test must expand both host permissions
and tool policy explicitly, use unchanged persisted idempotency keys and exact
facts, require human approval outside MCP, and observe authoritative verified
read-back. Accepted/queued/awaiting approval/input is never completion; a poll
timeout does not cancel a run. Unknown outcomes may have remote effects and must
not be retried with a new key. New non-contract context, dependency, conditional
and scheduled workflow APIs are now implemented only against the exact bounded-v2
contract in `sdk/GENERALIZATION.md`. For coordinator-owned host acceptance, allow
only the intended normalized tools, for example `lenslayer_context_search` for
pre-run read-only planning and `lenslayer_runs_graph` for readback. Graph creation
is `lenslayer_workflow_graphs_create`; it needs separate mutation authorization.
No planning hit can substitute for a durable evidence receipt. Local real-stdio
tests cover these shapes and fresh grants. The actual host acceptance above covers
legacy reads, tenant denial and revocation; context/graph tool execution through
the host and live staging acceptance remain unrun. Do not start workers/model
loops for blocked or future graph nodes.

References (read 2026-10-14): OpenCode V2
[MCP](https://opencode.ai/v2/docs/mcp-servers),
[CLI](https://opencode.ai/v2/docs/cli),
[config](https://opencode.ai/v2/docs/config),
[permissions](https://opencode.ai/v2/docs/permissions),
[policies](https://opencode.ai/v2/docs/policies),
[models](https://opencode.ai/v2/docs/models).
