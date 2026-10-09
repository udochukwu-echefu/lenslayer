import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { LensLayerClient } from "@lenslayer/agent-sdk";
import { runFollowUp } from "../../hosted-agent/dist/runner.js";
import { FileCheckpointStore } from "../../hosted-agent/dist/checkpoint.js";

// Explicit disposable-fixture check, never part of normal tests or a provider call.
const baseUrl = process.env.LENSLAYER_AGENT_TEST_API_URL;
const testRoot = process.env.LENSLAYER_AGENT_TEST_ROOT;
const python = process.env.LENSLAYER_TEST_PYTHON;
if (!baseUrl || !testRoot || !python) throw new Error("Set loopback test API, disposable root and test Python interpreter.");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname));
const root = fileURLToPath(new URL("../../", import.meta.url));
const identity = { "X-LensLayer-User": "experience-check-owner", "X-LensLayer-Email": "experience@example.test", Connection: "close" };
async function human(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, { method, headers: { ...identity, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `Fixture human ${method} failed (${response.status})`);
  return response.json();
}
function worker() {
  execFileSync(python, ["-m", "examples.agents.tests.local_backend", "--worker"], { cwd: root, env: { PATH: process.env.PATH, LENSLAYER_AGENT_TEST_ROOT: testRoot }, stdio: "pipe" });
}
const owner = await human("/me");
const org = await human("/organizations", "POST", { name: "Experience disposable integration", slug: `experience-${Date.now()}` });
const workspace = `/organizations/${org.id}`;
const upload = new FormData();
upload.set("file", new Blob(["Synthetic retained agreement. Give renewal notice 30 days before renewal on 2099-11-29."], { type: "text/plain" }), "synthetic.txt");
upload.set("title", "Synthetic agent integration source"); upload.set("retain_source_text", "true");
const document = await human(`${workspace}/contracts`, "POST", upload); worker();
const contractId = document.contract.id;
const deadlineAt = new Date(Date.now() + 3600000).toISOString();
const scope = { name: "Experience stdio integration", allowed_tools: ["documents.retrieve", "workspace.tasks.create"], contract_ids: [contractId], assignee_ids: [owner.id], expires_at: new Date(Date.now() + 86400000).toISOString(), require_approval: true, max_actions_per_run: 1 };
const delegated = await human(`${workspace}/agents`, "POST", scope);
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../dist/stdio.js", import.meta.url))], env: { LENSLAYER_API_URL: baseUrl, LENSLAYER_AGENT_TOKEN: delegated.token }, stderr: "pipe" });
let stderr = ""; transport.stderr?.on("data", (chunk) => { stderr += chunk; });
const client = new Client({ name: "lenslayer-disposable-http-smoke", version: "1.0.0" });
try {
  await client.connect(transport); // actual initialize handshake
  assert.equal(client.getServerVersion().name, "lenslayer-agent");
  assert.ok((await client.listTools()).tools.some((t) => t.name === "workspace.tasks.propose"));
  const call = async (name, args) => { const response = await client.callTool({ name, arguments: args }); assert.ok(!response.isError, `Tool ${name} failed`); return response.structuredContent.data; };
  const run = await call("runs.create", { idempotency_key: "mcp-real-run", goal: "Create one evidence-linked internal task", contract_ids: [contractId], allowed_tools: scope.allowed_tools, max_actions: 1, deadline_at: deadlineAt, success_condition: { type: "workspace_task_created", contract_id: contractId, assigned_to_user_id: owner.id, due_at: "2099-10-30T09:00:00Z" } });
  const evidence = await call("documents.retrieve", { run_id: run.id, input: { contract_id: contractId, query: "renewal notice" } });
  const proposal = { idempotency_key: "mcp-real-action", tool: "workspace.tasks.create", input: { contract_id: contractId, assigned_to_user_id: owner.id, due_at: "2099-10-30T09:00:00Z", title: "Review renewal notice deadline", evidence_id: evidence.id, deadline_basis: { renewal_date: "2099-11-29", notice_days: 30 } } };
  const action = await call("workspace.tasks.propose", { run_id: run.id, action: proposal });
  assert.equal(action.status, "awaiting_approval"); worker();
  assert.equal((await human(`${workspace}/tasks`)).length, 0);
  await human(`${workspace}/agent-runs/${run.id}/actions/${action.id}/approval`, "POST", { decision: "approved", reason: "Checked exact source, assignee and explicit dates in disposable fixture." });
  worker();
  const completed = await call("runs.poll", { run_id: run.id, timeout_ms: 10000 });
  assert.equal(completed.status, "succeeded"); assert.equal(completed.result.verified, true); assert.equal(completed.result.verification_method, "database_read_back");
  assert.equal((await call("workspace.tasks.propose", { run_id: run.id, action: proposal })).id, action.id);
  assert.ok((await call("runs.events", { run_id: run.id, after_sequence: 0, limit: 200 })).length > 1);
  worker(); assert.equal((await human(`${workspace}/tasks`)).length, 1);
  assert.ok(!stderr.includes(delegated.token)); assert.ok(!stderr.includes(evidence.excerpt));
  console.log("PASS: official MCP initialize/listTools/callTool -> real API -> pending approval -> human approval -> actual worker -> database-read-back verified task; replay creates no duplicate.");
} finally { await client.close(); }

const plannerDelegation = await human(`${workspace}/agents`, "POST", { ...scope, name: "Experience planner integration" });
const api = new LensLayerClient({ baseUrl, token: plannerDelegation.token });
const path = join(testRoot, `planner-${org.id}.json`);
const config = { goal: "retained-document-follow-up", runKey: "planner-real-run", actionKey: "planner-real-action", contractId, assigneeId: owner.id, dueAt: "2099-10-30T09:00:00Z", deadlineAt, query: "renewal notice", renewalDate: "2099-11-29", noticeDays: 30 };
let modelCalls = 0;
const planner = { plan: async (input) => { modelCalls++; return { decision: "task", ...input.facts, quote_start: 0, quote_end: input.untrustedSource.excerpt.length, missing: [] }; } };
const execute = async () => { const store = new FileCheckpointStore(path); return store.exclusive(() => runFollowUp(api, planner, store, config)); };
const pending = await execute(); assert.equal(pending.state, "awaiting_approval");
await execute(); assert.equal(modelCalls, 1);
worker(); assert.equal((await human(`${workspace}/tasks`)).length, 1);
await human(`${workspace}/agent-runs/${pending.runId}/actions/${pending.actionId}/approval`, "POST", { decision: "approved", reason: "Checked deterministic planner's exact proposal and retained evidence." });
worker();
assert.equal((await execute()).state, "succeeded"); await execute();
assert.equal((await human(`${workspace}/tasks`)).length, 2); assert.equal(modelCalls, 1);
console.log("PASS: injected typed planner -> real API/worker -> approval -> verified task; on-disk restart reuses original action/evidence with one planning call and no duplicate task.");
