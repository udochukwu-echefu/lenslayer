import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { contextGrants, graphInput, graphReadback, contextReceipt, invalidGraphs } from "../../sdk/tests/graph-fixtures.mjs";

test("real stdio graph/context: exact routes, closed shapes, v1-only grants, scope denial and fresh-call revocation", { timeout: 20000 }, async () => {
  const token = "ll_agent_synthetic_graph_wire";
  let grants = contextGrants, revoked = false, denied = false;
  const writes = [], paths = [];
  const api = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    paths.push(req.url); res.setHeader("Content-Type", "application/json");
    if (revoked) { res.writeHead(401); res.end(JSON.stringify({ detail: { token, goal: graphInput.goal, excerpt: contextReceipt.excerpt } })); return; }
    if (req.url === "/api/v1/agent/tools") { res.end(JSON.stringify(grants)); return; }
    let raw = ""; for await (const chunk of req) raw += chunk;
    if (raw) writes.push({ path: req.url, body: JSON.parse(raw) });
    if (denied) { res.writeHead(404); res.end(JSON.stringify({ detail: { token, excerpt: contextReceipt.excerpt } })); return; }
    let data;
    if (req.url === "/api/v1/agent/context-search") { const { id, created_at, ...hit } = contextReceipt; void id; void created_at; data = [hit]; }
    else if (req.url === "/api/v1/agent/workflow-graphs") data = { id: graphReadback.run_id, status: "awaiting_approval" };
    else if (req.url === `/api/v1/agent/runs/${graphReadback.run_id}/graph`) data = graphReadback;
    else if (req.url === `/api/v1/agent/runs/${graphReadback.run_id}/context-evidence`) data = [contextReceipt];
    else if (req.url === `/api/v1/agent/runs/${graphReadback.run_id}/context-evidence/${contextReceipt.id}`) data = contextReceipt;
    else { res.writeHead(404); data = {}; }
    res.end(JSON.stringify(data));
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../dist/stdio.js", import.meta.url))], env: { LENSLAYER_API_URL: `http://127.0.0.1:${api.address().port}`, LENSLAYER_AGENT_TOKEN: token }, stderr: "pipe" });
  let stderr = ""; transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const client = new Client({ name: "context-graph-wire", version: "1" });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools;
    assert.ok(tools.some((t) => t.name === "workflow_graphs.create"));
    assert.ok(tools.some((t) => t.name === "context.retrieve" && t.annotations.idempotentHint === false));
    assert.ok(!tools.some((t) => /calendar|workspace\.tasks|documents|approve|context_records|shell/.test(t.name)));
    const schema = JSON.stringify(tools.find((t) => t.name === "workflow_graphs.create").inputSchema);
    assert.ok(schema.includes("not_before_at") && schema.includes("depends_on"));
    assert.ok(!schema.includes("organization_id") && !schema.includes("token") && !schema.includes("expression"));
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent.data;
    };
    const hits = await call("context.search", { context_ids: ["context-1"], query: "customer onboarding" });
    assert.ok(!("id" in hits[0]) && !("created_at" in hits[0]));
    assert.ok(tools.find((t) => t.name === "context.search").annotations.readOnlyHint);
    assert.equal((await call("workflow_graphs.create", graphInput)).id, graphReadback.run_id);
    assert.deepEqual(writes.find((entry) => entry.path.endsWith("/workflow-graphs")), { path: "/api/v1/agent/workflow-graphs", body: graphInput });
    assert.deepEqual(await call("runs.graph", { run_id: graphReadback.run_id }), graphReadback);
    assert.equal((await call("context.retrieve", { run_id: graphReadback.run_id, input: { context_ids: ["context-1"], query: "customer onboarding" } }))[0].id, contextReceipt.id);
    assert.equal((await call("context.evidence.read", { run_id: graphReadback.run_id, evidence_id: contextReceipt.id })).source_sha256, contextReceipt.source_sha256);
    const before = writes.length;
    for (const change of invalidGraphs) assert.equal((await client.callTool({ name: "workflow_graphs.create", arguments: change(structuredClone(graphInput)) })).isError, true);
    assert.equal(writes.length, before, "Invalid shapes must never reach a mutation endpoint");
    denied = true;
    const outside = await client.callTool({ name: "context.evidence.read", arguments: { run_id: graphReadback.run_id, evidence_id: "other-tenant" } });
    assert.equal(outside.isError, true); assert.match(JSON.stringify(outside), /http_404/);
    denied = false;
    for (const version of [undefined, "2", 1]) {
      grants = contextGrants.map((g) => ({ ...g, version }));
      assert.deepEqual((await client.listTools()).tools, []);
      assert.equal((await client.callTool({ name: "workflow_graphs.create", arguments: graphInput })).isError, true);
    }
    grants = [contextGrants[0]];
    assert.ok(!(await client.listTools()).tools.some((t) => t.name === "workflow_graphs.create"));
    assert.ok((await client.listTools()).tools.some((t) => t.name === "context.evidence.read"));
    grants = contextGrants;
    await client.listTools(); revoked = true;
    const start = paths.length;
    const failed = await client.callTool({ name: "runs.graph", arguments: { run_id: graphReadback.run_id } });
    assert.equal(failed.isError, true);
    assert.deepEqual(paths.slice(start), ["/api/v1/agent/tools"]);
    assert.ok(!JSON.stringify([outside, failed]).includes(token));
    await assert.rejects(client.listTools());
    for (const value of [token, graphInput.goal, contextReceipt.excerpt]) assert.ok(!stderr.includes(value));
    assert.ok(!paths.some((p) => /\/organizations\/|\/tool-actions|\/approval/.test(p)));
  } finally { await client.close(); await new Promise((resolve) => api.close(resolve)); }
});
