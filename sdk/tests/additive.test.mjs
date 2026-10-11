import assert from "node:assert/strict";
import { test } from "node:test";
import { LensLayerClient, isTerminalRun } from "../dist/index.js";

test("additive routes preserve exact immutable calendar/composite/input payloads and stable retries", async () => {
  const bodies = [], paths = [];
  const client = new LensLayerClient({ baseUrl: "https://api.example.test", token: "ll_agent_additive_fixture", retryDelayMs: 0, fetch: async (url, init) => {
    paths.push(new URL(url).pathname); bodies.push(init.body);
    if (paths.length === 1) return Response.json({}, { status: 503 });
    return Response.json({ id: "record", status: "awaiting_input" });
  } });
  const condition = { type: "calendar_event_created", connection_id: "connection", calendar_id: "sandbox@example.test", summary: "Reminder", start_at: "2099-10-30T09:00:00Z", end_at: "2099-10-30T10:00:00Z" };
  const workflow = { idempotency_key: "run", calendar_targets: [{ connection_id: condition.connection_id, calendar_id: condition.calendar_id }], allowed_tools: ["google_calendar.events.create"], deadline_at: "2099-11-01T00:00:00Z", goal: "Create exact reminder", success_condition: { type: "all", conditions: [{ id: "reminder", condition }] } };
  await client.createWorkflow(workflow);
  assert.equal(paths[0], "/api/v1/agent/workflows"); assert.equal(bodies[0], bodies[1]); assert.deepEqual(JSON.parse(bodies[1]), workflow);
  await client.proposeToolAction("run/one", { idempotency_key: "action", tool: "google_calendar.events.create", input: { ...condition, condition_id: "reminder", description: "Explicit description" } });
  assert.equal(paths.at(-1), "/api/v1/agent/runs/run%2Fone/tool-actions");
  await client.requestInput("run", { idempotency_key: "facts", reason: "Confirm facts", fields: [{ name: "notice_days", type: "integer", prompt: "Days?" }], expires_at: "2099-10-01T00:00:00Z", responder: "human" });
  assert.equal(paths.at(-1), "/api/v1/agent/runs/run/input-requests");
  await client.inputRequests("run"); assert.equal(bodies.at(-1), undefined);
  await client.supplyInput("run", "request/one", { values: { notice_days: 30 } });
  assert.equal(paths.at(-1), "/api/v1/agent/runs/run/input-requests/request%2Fone/supply");
  assert.deepEqual(JSON.parse(bodies.at(-1)), { values: { notice_days: 30 } });
  assert.equal(isTerminalRun("awaiting_input"), false);
});
