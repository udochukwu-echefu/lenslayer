import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { request as requestHttp } from "node:http";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { LensLayerClient } from "@lenslayer/agent-sdk";

// Explicit loopback, disposable fake-provider integration only. No live APIs.
const baseUrl = process.env.LENSLAYER_AGENT_TEST_API_URL;
const testRoot = process.env.LENSLAYER_AGENT_TEST_ROOT;
const python = process.env.LENSLAYER_TEST_PYTHON;
if (!baseUrl || !testRoot || !python) throw new Error("Set disposable fixture API, root and Python interpreter.");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname));
assert.equal(new URL(baseUrl).protocol, "http:");
await readFile(join(testRoot, "calendar-fixture-ack"));
const root = fileURLToPath(new URL("../../", import.meta.url));
const identity = { "X-LensLayer-User": "workflow-check-owner", "X-LensLayer-Email": "workflow@example.test", Connection: "close" };
async function human(path, method = "GET", body) {
  const input = new Request(`${baseUrl}/api/v1${path}`, { method, headers: { ...identity, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  const bytes = body ? Buffer.from(await input.arrayBuffer()) : undefined;
  // Separate sockets avoid borrowing idle fetch sockets while execFileSync blocks
  // the test event loop. Mutating human calls are never automatically replayed.
  return new Promise((resolve, reject) => {
    const request = requestHttp(input.url, { method, headers: Object.fromEntries(input.headers), agent: false }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          assert.ok(response.statusCode >= 200 && response.statusCode < 300, `Fixture human ${method} ${path} failed (${response.statusCode})`);
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    request.on("error", reject); request.end(bytes);
  });
}
function worker() {
  execFileSync(python, ["-m", "examples.agents.tests.calendar_backend", "--worker"], { cwd: root, env: { PATH: process.env.PATH, LENSLAYER_AGENT_TEST_ROOT: testRoot }, stdio: "pipe" });
}
let baselineInserts = 0;
async function inserts() {
  try { return (await readFile(join(testRoot, "synthetic-google-inserts.jsonl"), "utf8")).trim().split("\n").filter(Boolean).length - baselineInserts; }
  catch (error) { if (error.code === "ENOENT") return 0; throw error; }
}
baselineInserts = await inserts();
const owner = await human("/me");
const org = await human("/organizations", "POST", { name: "Disposable generalized workflow", slug: `workflow-${Date.now()}` });
const workspace = `/organizations/${org.id}`;
const start = await human(`${workspace}/calendar/oauth/start`, "POST", { display_name: "Synthetic owned calendar", calendar_id: "owned-calendar@example.test" });
const state = new URL(start.authorization_url).searchParams.get("state");
const connection = await human(`${workspace}/calendar/oauth/callback`, "POST", { state, code: "synthetic-code-never-sent-to-google" });
const target = { connection_id: connection.id, calendar_id: "owned-calendar@example.test" };
const expiry = new Date(Date.now() + 86400000).toISOString();
const deadline = new Date(Date.now() + 3600000).toISOString();
const condition = { type: "calendar_event_created", ...target, summary: "Synthetic approved event", start_at: "2099-10-30T09:00:00Z", end_at: "2099-10-30T09:15:00Z" };
const scoped = await human(`${workspace}/agents`, "POST", { name: "Calendar-only client", contract_ids: [], assignee_ids: [], calendar_targets: [target], allowed_tools: ["google_calendar.events.create"], require_approval: true, expires_at: expiry, max_actions_per_run: 1 });
const api = new LensLayerClient({ baseUrl, token: scoped.token });
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../dist/stdio.js", import.meta.url))], env: { LENSLAYER_API_URL: baseUrl, LENSLAYER_AGENT_TOKEN: scoped.token }, stderr: "pipe" });
let stderr = ""; transport.stderr?.on("data", (chunk) => { stderr += chunk; });
const mcp = new Client({ name: "lenslayer-calendar-http-smoke", version: "1.0.0" });
try {
  await mcp.connect(transport);
  const tools = (await mcp.listTools()).tools;
  assert.ok(tools.some((tool) => tool.name === "calendar.events.propose"));
  assert.ok(!tools.some((tool) => tool.name === "workspace.tasks.propose" || tool.name === "documents.retrieve"));
  const run = await api.createWorkflow({ idempotency_key: "calendar-sdk-run", goal: "Create one exact private event", calendar_targets: [target], allowed_tools: ["google_calendar.events.create"], max_actions: 1, deadline_at: deadline, success_condition: condition });
  const requested = await api.requestInput(run.id, { idempotency_key: "human-facts", reason: "Confirm factual context before proposal", fields: [{ name: "confirmed", type: "boolean", prompt: "Is the context confirmed?" }, { name: "count", type: "integer", prompt: "Confirmed count" }, { name: "observed_at", type: "date_time", prompt: "Exact observation time" }], expires_at: deadline, responder: "human" });
  assert.equal((await api.getRun(run.id)).status, "awaiting_input");
  await assert.rejects(api.supplyInput(run.id, requested.id, { values: { confirmed: false, count: 7, observed_at: "2026-10-08T13:00:00+01:00" } }), (error) => error.status === 403);
  await human(`${workspace}/agent-runs/${run.id}/input-requests/${requested.id}/supply`, "POST", { values: { confirmed: false, count: 7, observed_at: "2026-10-08T13:00:00+01:00" } });
  const supplied = (await api.inputRequests(run.id))[0];
  assert.equal(supplied.status, "supplied"); assert.equal(supplied.values.confirmed, false);
  assert.equal(Date.parse(supplied.values.observed_at), Date.parse("2026-10-08T12:00:00Z"));
  assert.equal((await api.getRun(run.id)).status, "running");
  const proposal = { idempotency_key: "calendar-sdk-action", tool: "google_calendar.events.create", tool_version: "1", input: condition };
  const response = await mcp.callTool({ name: "calendar.events.propose", arguments: { run_id: run.id, action: proposal } });
  assert.ok(!response.isError);
  const action = response.structuredContent.data;
  assert.equal(action.status, "awaiting_approval"); worker(); assert.equal(await inserts(), 0);
  await human(`${workspace}/agent-runs/${run.id}/actions/${action.id}/approval`, "POST", { decision: "approved", reason: "Checked the exact synthetic target and interval." });
  worker();
  const done = await api.pollRun(run.id, { timeoutMs: 10000 });
  assert.equal(done.status, "succeeded"); assert.equal(done.result.verified, true);
  assert.equal(done.result.verification_method, "google_events_get"); assert.equal(done.result.provenance_origin, "approved_action");
  assert.equal((await api.proposeToolAction(run.id, proposal)).id, action.id);
  worker(); assert.equal(await inserts(), 1);
  assert.ok(!stderr.includes(scoped.token));
  console.log("PASS: calendar-only SDK/MCP -> typed human input -> immutable approval -> actual worker/fake HTTP -> verified event; replay creates one insert.");
} finally { await mcp.close(); }

const upload = new FormData(); upload.set("file", new Blob(["Synthetic retained source. Give renewal notice before renewal."], { type: "text/plain" }), "synthetic-workflow.txt"); upload.set("title", "Synthetic composite source"); upload.set("retain_source_text", "true");
const document = await human(`${workspace}/contracts`, "POST", upload); worker();
const contractId = document.contract.id;
const both = await human(`${workspace}/agents`, "POST", { name: "Composite client", contract_ids: [contractId], assignee_ids: [owner.id], calendar_targets: [target], allowed_tools: ["documents.retrieve", "workspace.tasks.create", "google_calendar.events.create"], require_approval: true, expires_at: expiry, max_actions_per_run: 2 });
const combined = new LensLayerClient({ baseUrl, token: both.token });
const due = "2099-10-30T08:00:00Z";
const all = { type: "all", conditions: [{ id: "follow_up", condition: { type: "workspace_task_created", contract_id: contractId, assigned_to_user_id: owner.id, due_at: due } }, { id: "calendar", condition: { ...condition, summary: "Synthetic composite event" } }] };
const workflow = await combined.createWorkflow({ idempotency_key: "composite-sdk-run", goal: "Create exact task and calendar event", contract_ids: [contractId], calendar_targets: [target], allowed_tools: ["documents.retrieve", "workspace.tasks.create", "google_calendar.events.create"], max_actions: 2, deadline_at: deadline, success_condition: all });
const evidence = await combined.retrieveEvidence(workflow.id, { contract_id: contractId, query: "renewal notice" });
const task = await combined.proposeToolAction(workflow.id, { idempotency_key: "composite-task", tool: "workspace.tasks.create", input: { condition_id: "follow_up", contract_id: contractId, assigned_to_user_id: owner.id, due_at: due, title: "Synthetic follow-up", evidence_id: evidence.id } });
await human(`${workspace}/agent-runs/${workflow.id}/actions/${task.id}/approval`, "POST", { decision: "approved", reason: "Checked synthetic exact task." }); worker();
const checkpoint = await combined.getRun(workflow.id); assert.equal(checkpoint.status, "running"); assert.equal(checkpoint.result.verified, false); assert.ok(checkpoint.result.completed_conditions.follow_up);
const facts = await combined.requestInput(workflow.id, { idempotency_key: "agent-facts", reason: "Record factual context between verified steps", fields: [{ name: "source_context", type: "text", prompt: "Confirm factual context" }], expires_at: deadline, responder: "agent" });
await combined.supplyInput(workflow.id, facts.id, { values: { source_context: "Synthetic context confirmed." } });
const calendar = await combined.proposeToolAction(workflow.id, { idempotency_key: "composite-calendar", tool: "google_calendar.events.create", input: { ...all.conditions[1].condition, condition_id: "calendar", contract_id: contractId, evidence_id: evidence.id } });
await human(`${workspace}/agent-runs/${workflow.id}/actions/${calendar.id}/approval`, "POST", { decision: "approved", reason: "Checked synthetic source and calendar step." }); worker();
const finished = await combined.getRun(workflow.id); assert.equal(finished.status, "succeeded"); assert.equal(finished.result.verified, true); assert.deepEqual(Object.keys(finished.result.completed_conditions).sort(), ["calendar", "follow_up"]); assert.equal(await inserts(), 2);
console.log("PASS: composite SDK workflow persists a verified task checkpoint across separate worker processes; both named receipts required for success.");

const uncertain = await api.createWorkflow({ idempotency_key: "uncertain-sdk-run", goal: "Observe uncertain read-back", calendar_targets: [target], allowed_tools: ["google_calendar.events.create"], max_actions: 1, deadline_at: deadline, success_condition: { ...condition, summary: "Synthetic uncertain event" } });
const external = await api.proposeToolAction(uncertain.id, { idempotency_key: "uncertain-calendar", tool: "google_calendar.events.create", input: { ...condition, summary: "Synthetic uncertain event" } });
await human(`${workspace}/agent-runs/${uncertain.id}/actions/${external.id}/approval`, "POST", { decision: "approved", reason: "Observe synthetic write/read-back uncertainty." });
await writeFile(join(testRoot, "simulate-unreadable-readback"), "synthetic-only"); worker();
await unlink(join(testRoot, "simulate-unreadable-readback"));
const unknown = (await api.actions(uncertain.id))[0];
assert.equal(unknown.status, "unknown_outcome"); assert.equal(unknown.result.dispatch_may_have_effect, true); assert.equal((await api.getRun(uncertain.id)).status, "failed"); assert.equal(await inserts(), 3);
await human(`${workspace}/agent-runs/${uncertain.id}/actions/${external.id}/reconcile`, "POST"); worker();
const reconciled = (await api.actions(uncertain.id))[0]; assert.equal(reconciled.result.verified, true); assert.equal(reconciled.result.partial_effect, true); assert.equal((await api.getRun(uncertain.id)).status, "failed"); assert.equal(await inserts(), 3);
console.log("PASS: post-insert read failure remains uncertain; operator reconciliation performs GET only, records partial effect and leaves the terminal run failed.");
await human(`${workspace}/calendar/connections/${connection.id}/disconnect`, "POST");
