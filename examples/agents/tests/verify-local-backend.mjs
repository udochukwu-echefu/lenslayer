import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LensLayerClient, LensLayerHttpError } from "../../../sdk/dist/index.js";
import { createRenewalFollowUp } from "../workflow.mjs";

// Explicit opt-in only. Normal unit tests never use an actual network or worker.
const baseUrl = process.env.LENSLAYER_AGENT_TEST_API_URL;
const testRoot = process.env.LENSLAYER_AGENT_TEST_ROOT;
if (!baseUrl || !testRoot) throw new Error("Set LENSLAYER_AGENT_TEST_API_URL and LENSLAYER_AGENT_TEST_ROOT for the disposable fixture.");
const origin = new URL(baseUrl);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname), "This fixture must only target loopback.");
const root = fileURLToPath(new URL("../../../", import.meta.url));
// Synchronous worker subprocesses can outlive uvicorn's idle keep-alive timeout.
// Fresh fixture connections avoid reusing that stale socket for a human mutation.
const headers = { "X-LensLayer-User": "local-user", "X-LensLayer-Email": "owner@example.test", "X-LensLayer-Name": "Local test owner", Connection: "close" };
async function human(path, method = "GET", body) {
  const response = await fetch(`${baseUrl}/api/v1${path}`, { method, headers: { ...headers, ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) }).catch(() => { throw new Error(`Human ${method} ${path} could not reach the disposable API.`); });
  assert.ok(response.ok, `Human ${method} ${path} failed (${response.status})`);
  return response.json();
}
function worker() {
  execFileSync(process.env.LENSLAYER_TEST_PYTHON || `${root}/.venv/bin/python`, ["-m", "examples.agents.tests.local_backend", "--worker"], { cwd: root, env: process.env, stdio: "pipe" });
}

const owner = await human("/me");
const org = await human("/organizations", "POST", { name: "Disposable agent workflow", slug: `agent-check-${Date.now()}` });
const workspace = `/organizations/${org.id}`;
const upload = new FormData();
upload.set("file", new Blob(["Supplier agreement\nThis agreement renews on 2099-11-29. Give renewal notice at least 30 days before renewal."], { type: "text/plain" }), "supplier.txt");
upload.set("title", "Disposable retained supplier agreement");
upload.set("retain_source_text", "true");
const uploaded = await human(`${workspace}/contracts`, "POST", upload);
worker();
const contractId = uploaded.contract.id;
const expiry = new Date(Date.now() + 86400000).toISOString();
const deadline = new Date(Date.now() + 3600000).toISOString();
const scope = { name: "Local approval test", allowed_tools: ["documents.retrieve", "workspace.tasks.create"], contract_ids: [contractId], assignee_ids: [owner.id], expires_at: expiry, require_approval: true, max_actions_per_run: 1 };
const created = await human(`${workspace}/agents`, "POST", scope);
const api = new LensLayerClient({ baseUrl, token: created.token });
assert.deepEqual((await api.tools()).map((tool) => tool.name).sort(), [...scope.allowed_tools].sort());
const runInput = { idempotency_key: "local-approval-run", goal: "Create one evidence-linked follow-up task", contract_ids: [contractId], allowed_tools: scope.allowed_tools, max_actions: 1, deadline_at: deadline, success_condition: { type: "workspace_task_created", contract_id: contractId, assigned_to_user_id: owner.id, due_at: "2099-10-30T09:00:00Z" } };
const run = await api.createRun(runInput);
const receipt = await api.retrieveEvidence(run.id, { contract_id: contractId, query: "renewal notice" });
assert.ok(receipt.excerpt.includes("30 days"));
assert.equal((await api.readEvidence(run.id, receipt.id)).source_sha256, receipt.source_sha256);
const actionInput = { idempotency_key: "local-approval-action", tool: "workspace.tasks.create", input: { contract_id: contractId, assigned_to_user_id: owner.id, title: "Review renewal notice deadline", description: "Confirm renewal decision; no notice is sent.", due_at: runInput.success_condition.due_at, evidence_id: receipt.id, deadline_basis: { renewal_date: "2099-11-29", notice_days: 30 } } };
const action = await api.proposeAction(run.id, actionInput);
assert.equal(action.status, "awaiting_approval");
worker();
assert.equal((await human(`${workspace}/tasks`)).length, 0);
await human(`${workspace}/agent-runs/${run.id}/actions/${action.id}/approval`, "POST", { decision: "approved", reason: "Checked retained clause, exact scope, assignee, and caller-supplied dates." });
worker();
const final = await api.pollRun(run.id, { intervalMs: 1, timeoutMs: 10000, deadlineAt: deadline });
assert.equal(final.status, "succeeded");
assert.equal(final.result.verified, true);
assert.equal(final.result.verification_method, "database_read_back");
const tasks = await human(`${workspace}/tasks`);
assert.equal(tasks.length, 1);
assert.equal(tasks[0].assigned_to_user_id, owner.id);
assert.equal(Date.parse(final.result.due_at), Date.parse(runInput.success_condition.due_at));
// Existing task serialization omits the zone for SQLite's naive UTC values.
const taskDue = /(?:Z|[+-]\d{2}:\d{2})$/.test(tasks[0].due_at) ? tasks[0].due_at : `${tasks[0].due_at}Z`;
assert.equal(Date.parse(taskDue), Date.parse(runInput.success_condition.due_at));
assert.equal(tasks[0].source_reference.evidence_id, receipt.id);
assert.equal((await api.createRun(runInput)).id, run.id);
assert.equal((await api.proposeAction(run.id, actionInput)).id, action.id);
worker();
assert.equal((await human(`${workspace}/tasks`)).length, 1);
const sequences = [];
for await (const event of api.iterateEvents(run.id, { limit: 2 })) sequences.push(event.sequence);
assert.deepEqual(sequences, Array.from({ length: sequences.length }, (_, index) => index + 1));
await human(`${workspace}/agents/${created.agent.id}/revoke`, "POST");
await assert.rejects(api.getRun(run.id), (error) => error instanceof LensLayerHttpError && error.status === 401);
console.log("PASS: retained upload -> SDK run -> evidence -> human approval -> real worker -> verified task; idempotent replay, pagination, and revocation.");

const exampleCreated = await human(`${workspace}/agents`, "POST", { ...scope, name: "Local example test", require_approval: false });
const exampleApi = new LensLayerClient({ baseUrl, token: exampleCreated.token });
const poll = exampleApi.pollRun.bind(exampleApi);
exampleApi.pollRun = async (id, options) => { worker(); return poll(id, { ...options, intervalMs: 1, timeoutMs: 10000 }); };
const config = { baseUrl, token: exampleCreated.token, dashboardUrl: "http://localhost:3108", contractId, assigneeId: owner.id, dueAt: "2099-10-30T09:00:00Z", deadlineAt: deadline, runKey: "local-example-run", actionKey: "local-example-action", query: "renewal notice", deadlineBasis: { renewal_date: "2099-11-29", notice_days: 30 }, timeoutMs: 10000 };
const exampleRun = await createRenewalFollowUp(exampleApi, config, { log: () => {} });
assert.equal(exampleRun.status, "succeeded");
await createRenewalFollowUp(exampleApi, config, { log: () => {} });
assert.equal((await human(`${workspace}/tasks`)).length, 2);
console.log("PASS: runnable example creates a verified task and safely replays without another task.");

// Non-secret fixture references for optional browser inspection of an approval.
const reviewCreated = await human(`${workspace}/agents`, "POST", { ...scope, name: "Local dashboard approval test" });
const reviewApi = new LensLayerClient({ baseUrl, token: reviewCreated.token });
const reviewRun = await reviewApi.createRun({ ...runInput, idempotency_key: "local-ui-run", goal: "Inspect and approve a source-linked renewal follow-up" });
const reviewReceipt = await reviewApi.retrieveEvidence(reviewRun.id, { contract_id: contractId, query: "renewal notice" });
const reviewAction = await reviewApi.proposeAction(reviewRun.id, { ...actionInput, idempotency_key: "local-ui-action", input: { ...actionInput.input, evidence_id: reviewReceipt.id } });
writeFileSync(`${testRoot}/ui-records.json`, JSON.stringify({ organizationId: org.id, runId: reviewRun.id, actionId: reviewAction.id, contractId, assigneeId: owner.id }, null, 2));
console.log("PASS: an awaiting-approval record is available for local dashboard inspection; no bearer tokens were written to artifacts.");
