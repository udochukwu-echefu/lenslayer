import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Client as CurrentClient } from "@modelcontextprotocol/client";
import { StdioClientTransport as CurrentTransport } from "@modelcontextprotocol/client/stdio";
import { Client as HostClient } from "opencode-mcp-client-2-0";
import { StdioClientTransport as HostTransport } from "opencode-mcp-client-2-0/stdio";

// OpenCode v2.0.18 pins client/core 2.0.0. This tests its MCP boundary, NOT
// OpenCode's registry, permission engine, provider request or Code Mode runtime.
const entry = fileURLToPath(new URL("../dist/stdio.js", import.meta.url));
const token = "ll_agent_synthetic_protocol_only";
const grants = ["documents.retrieve", "workspace.tasks.create", "google_calendar.events.create", "context.retrieve", "workspace.context_tasks.create"].map((name) => ({ name, version: "1" }));
const normalize = (name) => name.replace(/[^a-zA-Z0-9_-]/g, "_");

async function fixture(Client, Transport, protocol) {
  let revoked = false, currentGrants = grants;
  const requests = [], methods = [];
  const http = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401); res.end("{}");
    } else if (revoked) {
      res.writeHead(401); res.end(JSON.stringify({ detail: token }));
    } else if (req.url === "/api/v1/agent/tools") {
      res.end(JSON.stringify(currentGrants));
    } else if (req.url === "/api/v1/agent/runs?limit=1") {
      res.end("[]");
    } else {
      res.writeHead(404); res.end("{}");
    }
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const transport = new Transport({
    command: process.execPath, args: [entry], stderr: "pipe",
    env: { LENSLAYER_API_URL: `http://127.0.0.1:${http.address().port}`, LENSLAYER_AGENT_TOKEN: token },
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const send = transport.send.bind(transport);
  transport.send = (message, ...args) => {
    if (message.method) methods.push(message.method); // Method names only, never bodies or _meta.
    return send(message, ...args);
  };
  // Match McpClient.connect's 2.0.18 capabilities/list-change setup.
  const changed = { autoRefresh: false, debounceMs: 0, onChanged: () => {} };
  const client = new Client({ name: "opencode-boundary-fixture", version: "2.0.18" }, {
    capabilities: { roots: {}, elicitation: { form: { applyDefaults: true }, url: {} } },
    ...(protocol === "legacy" ? {} : { versionNegotiation: { mode: protocol === "auto" ? "auto" : { pin: protocol } } }),
    listChanged: { tools: changed, prompts: changed, resources: changed },
  });
  client.setRequestHandler("roots/list", () => ({ roots: [{ uri: new URL("../", import.meta.url).href }] }));
  client.setRequestHandler("elicitation/create", () => ({ action: "cancel" }));
  client.setNotificationHandler("notifications/elicitation/complete", () => {});
  try {
    await client.connect(transport, { timeout: 3000 });
    assert.equal(client.getProtocolEra(), protocol === "legacy" ? "legacy" : "modern");
    // The SDK probes stdio on a disposable sibling transport, not this send wrapper.
    assert.equal(Boolean(client.getDiscoverResult()), protocol !== "legacy");
    assert.equal(methods.includes("initialize"), protocol === "legacy");
    const initial = (await client.listTools(undefined, { timeout: 3000 })).tools;
    assert.ok(initial.some((tool) => tool.name === "runs.list"));
    const names = initial.map((tool) => `lenslayer_${normalize(tool.name)}`);
    assert.equal(new Set(names).size, names.length, "No normalized host-name collisions");
    assert.ok(names.every((name) => /^[A-Za-z0-9_-]{1,128}$/.test(name)));
    const before = requests.length;
    const result = await client.callTool({
      name: "runs.list", arguments: { limit: 1 }, _meta: { "ai.opencode/sessionID": "ses_fixture_not_authority" },
    }, { timeout: 3000, onprogress: () => {} });
    assert.equal(result.isError === true, false);
    assert.deepEqual(result.structuredContent, { data: [] });
    assert.deepEqual(JSON.parse(result.content[0].text), { data: [] });
    assert.deepEqual(requests.slice(before), ["GET /api/v1/agent/tools", "GET /api/v1/agent/runs?limit=1"]);
    // Repeated discovery must not be a sticky SDK catalog. A host can still cache it.
    currentGrants = [];
    assert.deepEqual((await client.listTools()).tools, []);
    currentGrants = grants;
    assert.deepEqual((await client.listTools()).tools, initial);
    revoked = true;
    const after = requests.length;
    const denied = await client.callTool({ name: "runs.list", arguments: { limit: 1 } }, { timeout: 3000, onprogress: () => {} });
    assert.equal(denied.isError, true);
    assert.equal(JSON.parse(denied.content[0].text).error, "http_401");
    assert.deepEqual(requests.slice(after), ["GET /api/v1/agent/tools"]);
    await assert.rejects(client.listTools());
    assert.ok(!JSON.stringify(denied).includes(token));
    assert.ok(!stderr.includes(token));
    return initial;
  } finally {
    await client.close();
    await new Promise((resolve) => http.close(resolve));
  }
}

for (const [version, Client, Transport] of [["2.0.0 (OpenCode 2.0.18)", HostClient, HostTransport], ["2.3.1", CurrentClient, CurrentTransport]]) {
  test(`real stdio: MCP client ${version}, legacy/auto/pinned catalog and call parity`, { timeout: 20000 }, async () => {
    const legacy = await fixture(Client, Transport, "legacy");
    assert.deepEqual(await fixture(Client, Transport, "auto"), legacy);
    assert.deepEqual(await fixture(Client, Transport, "2026-07-28"), legacy);
  });
}

test("parent fixture: credential-free auto discovery and bounded read through the 2.0.0 client", { timeout: 5000 }, async () => {
  const transport = new HostTransport({ command: process.execPath, args: [fileURLToPath(new URL("./opencode-auto-fixture.mjs", import.meta.url))], env: {}, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const client = new HostClient({ name: "parent-fixture-test", version: "1" }, { versionNegotiation: { mode: "auto" } });
  try {
    await client.connect(transport, { timeout: 1500 });
    assert.equal(client.getProtocolEra(), "modern");
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === "runs.list"));
    assert.ok(!stderr.includes('"event":"fixture_read"'), "Discovery must not execute a read");
    assert.deepEqual((await client.callTool({ name: "runs.list", arguments: { limit: 1 } })).structuredContent, { data: [] });
    assert.equal((await client.callTool({ name: "runs.status", arguments: { run_id: "fixture-only" } })).isError, true);
    assert.ok(stderr.includes('"event":"fixture_discovery"'));
    assert.ok(stderr.includes('"event":"fixture_read","count":1'));
    assert.ok(!stderr.includes("ll_agent_"));
  } finally { await client.close(); }
});
