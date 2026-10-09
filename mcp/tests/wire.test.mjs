import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { LensLayerClient } from "@lenslayer/agent-sdk";
import { createAgentServer } from "../dist/server.js";

const token = "ll_agent_synthetic_wire_only";
const tools = ["documents.retrieve", "workspace.tasks.create"].map((name) => ({ name, version: "1", description: name, requires_approval: true, input_schema: {} }));
const input = { idempotency_key: "wire-run", goal: "Create an assigned follow-up", contract_ids: ["contract"], allowed_tools: tools.map((t) => t.name), max_actions: 1, deadline_at: "2099-01-01T00:00:00Z", success_condition: { type: "workspace_task_created", contract_id: "contract", assigned_to_user_id: "assignee", due_at: "2098-12-01T09:00:00Z" } };
const receipt = { id: "evidence", contract_id: "contract", version_id: "version", source_sha256: "a".repeat(64), excerpt: "Synthetic renewal notice clause", start_offset: 0, end_offset: 31, created_at: "2026-01-01T00:00:00Z" };
const task = { idempotency_key: "wire-task", tool: "workspace.tasks.create", input: { contract_id: "contract", assigned_to_user_id: "assignee", due_at: input.success_condition.due_at, title: "Review renewal", evidence_id: receipt.id } };

test("official SDK client -> real stdio -> injected HTTP ledger: initialize, discovery, pending, verified result", async () => {
  let grant = tools, status = "running", action;
  const requests = [];
  const http = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    requests.push(`${req.method} ${req.url}`);
    let text = ""; for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    let data;
    if (req.url === "/api/v1/agent/tools") data = grant;
    else if (req.url === "/api/v1/agent/runs" && req.method === "POST") { assert.deepEqual(body, input); data = { ...input, id: "run", status, result: {}, deadline_at: input.deadline_at }; }
    else if (req.url === "/api/v1/agent/runs/run/evidence" && req.method === "POST") data = receipt;
    else if (req.url === "/api/v1/agent/runs/run/actions" && req.method === "POST") { assert.deepEqual(body, task); status = "awaiting_approval"; action = { ...body, id: "action", status, approval_status: "pending" }; data = action; }
    else if (req.url === "/api/v1/agent/runs/run/actions") data = action ? [action] : [];
    else if (req.url.startsWith("/api/v1/agent/runs/run/events")) data = [{ sequence: 1, type: "action.proposed", data: {} }];
    else if (req.url === "/api/v1/agent/runs/run") data = { ...input, id: "run", status, result: status === "succeeded" ? { verified: true, verification_method: "database_read_back", task_id: "task" } : {} };
    else { res.writeHead(403, { "Content-Type": "application/json" }); res.end(JSON.stringify({ detail: `Denied ${token}` })); return; }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data));
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const transport = new StdioClientTransport({ command: process.execPath, args: [new URL("../dist/stdio.js", import.meta.url).pathname], env: { LENSLAYER_API_URL: `http://127.0.0.1:${http.address().port}`, LENSLAYER_AGENT_TOKEN: token }, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const client = new Client({ name: "lenslayer-wire-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().name, "lenslayer-agent"); // initialize negotiated by official SDK.
    const list = await client.listTools();
    assert.ok(list.tools.some((t) => t.name === "workspace.tasks.propose"));
    assert.ok(!list.tools.some((t) => /approv|exec|shell/.test(t.name)));
    const call = async (name, args) => {
      const response = await client.callTool({ name, arguments: args });
      assert.ok(!response.isError, JSON.stringify(response));
      return response.structuredContent.data;
    };
    assert.equal((await call("runs.create", input)).id, "run");
    assert.equal((await call("documents.retrieve", { run_id: "run", input: { contract_id: "contract", query: "renewal notice" } })).id, receipt.id);
    const pending = await call("workspace.tasks.propose", { run_id: "run", action: task });
    assert.equal(pending.status, "awaiting_approval"); assert.equal(pending.approval_status, "pending");
    assert.equal((await call("runs.status", { run_id: "run" })).status, "awaiting_approval");
    // Injected transport's human/worker transition, NOT proof of real DB verification.
    status = "succeeded";
    assert.equal((await call("runs.poll", { run_id: "run", timeout_ms: 100 })).result.verified, true);
    const invalid = await client.callTool({ name: "runs.poll", arguments: { run_id: "run", timeout_ms: 30001, token } });
    assert.equal(invalid.isError, true); assert.ok(!JSON.stringify(invalid).includes(token));
    grant = [tools[0]];
    assert.ok(!(await client.listTools()).tools.some((t) => t.name === "workspace.tasks.propose"));
    const denied = await client.callTool({ name: "workspace.tasks.propose", arguments: { run_id: "run", action: task } });
    assert.equal(denied.isError, true);
    grant = [];
    assert.deepEqual((await client.listTools()).tools, []);
    await assert.rejects(client.callTool({ name: "actions.approve", arguments: {} }));
    assert.ok(!requests.some((r) => /organizations|approval/.test(r)));
    assert.ok(!stderr.includes(token)); assert.ok(!stderr.includes(receipt.excerpt));
  } finally { await client.close(); await new Promise((resolve) => http.close(resolve)); }
});

test("modern July 2026 discovery/envelope handled by official SDK; credential-safe API errors", async () => {
  let revoked = false;
  const api = new LensLayerClient({ baseUrl: "https://api.example.test", token, maxRetries: 0, fetch: async () => revoked ? Response.json({ detail: `Bearer ${token}` }, { status: 401 }) : Response.json(tools) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = serveStdio(() => createAgentServer(api, () => {}), { transport: b });
  const client = new Client({ name: "modern-client", version: "1" }, { versionNegotiation: { mode: "auto" } });
  try {
    await client.connect(a);
    assert.ok(client.getDiscoverResult());
    assert.ok((await client.listTools()).tools.length);
    revoked = true;
    await assert.rejects(client.listTools(), (error) => !String(error).includes(token));
    const failed = await client.callTool({ name: "runs.status", arguments: { run_id: "any" } });
    assert.equal(failed.isError, true); assert.ok(!JSON.stringify(failed).includes(token));
  } finally { await client.close(); await server.close(); }
});

test("calendar-only discovery exposes only delegated workflow schemas and exact implemented routes", async () => {
  const forwarded = [];
  const api = new LensLayerClient({ baseUrl: "https://fixture.example.test", token, fetch: async (url, init) => {
    if (url.endsWith("/agent/tools")) return Response.json([{ name: "google_calendar.events.create", version: "1" }]);
    forwarded.push({ path: new URL(url).pathname, body: JSON.parse(init.body) });
    return Response.json({ id: "record", status: "unknown_outcome", result: { verified: false, dispatch_may_have_effect: true } });
  } });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = serveStdio(() => createAgentServer(api, () => {}), { transport: b });
  const client = new Client({ name: "calendar-test", version: "1" }, { versionNegotiation: { mode: "auto" } });
  try {
    await client.connect(a);
    const tools = (await client.listTools()).tools;
    assert.ok(tools.some((t) => t.name === "calendar.events.propose"));
    assert.ok(!tools.some((t) => /workspace\.tasks|documents\.retrieve|evidence\.read|^runs.create$/.test(t.name)));
    const schema = JSON.stringify(tools.find((t) => t.name === "workflows.create").inputSchema);
    assert.ok(!schema.includes("workspace_task_created")); assert.ok(schema.includes("calendar_event_created"));
    const condition = { type: "calendar_event_created", connection_id: "connection", calendar_id: "sandbox@example.test", summary: "Exact reminder", start_at: "2099-10-30T09:00:00Z", end_at: "2099-10-30T10:00:00Z" };
    const workflow = { idempotency_key: "workflow-key", goal: "Create exact calendar reminder", calendar_targets: [{ connection_id: condition.connection_id, calendar_id: condition.calendar_id }], allowed_tools: ["google_calendar.events.create"], max_actions: 1, deadline_at: "2099-11-01T00:00:00Z", success_condition: { type: "all", conditions: [{ id: "reminder", condition }] } };
    assert.ok(!(await client.callTool({ name: "workflows.create", arguments: workflow })).isError);
    assert.equal(forwarded[0].path, "/api/v1/agent/workflows");
    const action = { idempotency_key: "action-key", tool: "google_calendar.events.create", input: { ...condition, condition_id: "reminder" } };
    const result = await client.callTool({ name: "calendar.events.propose", arguments: { run_id: "run", action } });
    assert.equal(result.structuredContent.data.status, "unknown_outcome");
    assert.equal(result.structuredContent.data.result.verified, false);
    assert.equal(forwarded[1].path, "/api/v1/agent/runs/run/tool-actions");
    assert.equal(forwarded[1].body.input.condition_id, "reminder");
    const before = forwarded.length;
    assert.equal((await client.callTool({ name: "calendar.events.propose", arguments: { run_id: "run", action: { ...action, input: { ...action.input, attendees: ["someone"] } } } })).isError, true);
    assert.equal((await client.callTool({ name: "workflows.create", arguments: { ...workflow, success_condition: { type: "workspace_task_created", contract_id: "contract", assigned_to_user_id: "user", due_at: condition.start_at } } })).isError, true);
    assert.equal((await client.callTool({ name: "runs.request_input", arguments: { run_id: "run", request: { idempotency_key: "secret", reason: "Give credentials", responder: "agent", expires_at: condition.start_at, fields: [{ name: "api_token", type: "text", prompt: "Token?" }] } } })).isError, true);
    assert.equal(forwarded.length, before);
  } finally { await client.close(); await server.close(); }
});

test("official client forwards typed input lifecycle and mixed conditions without approval authority", async () => {
  const writes = [], inputs = [];
  const api = new LensLayerClient({ baseUrl: "https://fixture.example.test", token, fetch: async (url, init) => {
    const path = new URL(url).pathname;
    if (path === "/api/v1/agent/tools") return Response.json(["documents.retrieve", "workspace.tasks.create", "google_calendar.events.create"].map((name) => ({ name, version: "1" })));
    if (init.method === "GET") return Response.json(inputs);
    const body = JSON.parse(init.body); writes.push({ path, body });
    if (path.endsWith("/input-requests")) {
      const record = { id: "request", run_id: "run", request: body, status: "pending", values: {} }; inputs.push(record); return Response.json(record, { status: 201 });
    }
    if (path.endsWith("/supply")) { inputs[0].status = "supplied"; inputs[0].values = body.values; return Response.json(inputs[0]); }
    return Response.json({ id: "run", status: "running", success_condition: body.success_condition });
  } });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = serveStdio(() => createAgentServer(api, () => {}), { transport: b });
  const client = new Client({ name: "input-test", version: "1" }, { versionNegotiation: { mode: "auto" } });
  try {
    await client.connect(a);
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    assert.ok(!names.some((name) => /approve|reconcile|oauth|execute/.test(name)));
    const calendar = { type: "calendar_event_created", connection_id: "connection", calendar_id: "sandbox@example.test", summary: "Reminder", start_at: "2099-10-30T09:00:00Z", end_at: "2099-10-30T10:00:00Z" };
    const task = { type: "workspace_task_created", contract_id: "contract", assigned_to_user_id: "user", due_at: calendar.start_at };
    const condition = { type: "all", conditions: [{ id: "task", condition: task }, { id: "calendar", condition: calendar }] };
    assert.ok(!(await client.callTool({ name: "workflows.create", arguments: { idempotency_key: "run", goal: "Exact mixed follow-up", contract_ids: ["contract"], calendar_targets: [{ connection_id: "connection", calendar_id: calendar.calendar_id }], allowed_tools: ["documents.retrieve", "workspace.tasks.create", "google_calendar.events.create"], max_actions: 2, deadline_at: "2099-11-01T00:00:00Z", success_condition: condition } })).isError);
    assert.deepEqual(writes[0].body.success_condition, condition);
    const request = { idempotency_key: "facts", reason: "Confirm explicit facts", fields: [{ name: "notice_days", type: "integer", prompt: "Days?" }, { name: "confirmed", type: "boolean", prompt: "Confirmed?" }], responder: "agent", expires_at: calendar.start_at };
    assert.equal((await client.callTool({ name: "runs.request_input", arguments: { run_id: "run", request } })).structuredContent.data.status, "pending");
    assert.deepEqual(writes.at(-1), { path: "/api/v1/agent/runs/run/input-requests", body: request });
    const values = { notice_days: 30, confirmed: true };
    assert.equal((await client.callTool({ name: "runs.supply_input", arguments: { run_id: "run", request_id: "request", input: { values } } })).structuredContent.data.status, "supplied");
    assert.deepEqual(writes.at(-1), { path: "/api/v1/agent/runs/run/input-requests/request/supply", body: { values } });
    assert.deepEqual((await client.callTool({ name: "runs.inputs", arguments: { run_id: "run" } })).structuredContent.data[0].values, values);
  } finally { await client.close(); await server.close(); }
});
