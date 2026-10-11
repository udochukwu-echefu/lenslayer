import assert from "node:assert/strict";
import { test } from "node:test";
import { createRenewalFollowUp } from "../workflow.mjs";
import { configurationFromEnv } from "../config.mjs";
import { env } from "./fixtures.mjs";

const config = configurationFromEnv(env);
const run = { id: "run-1", status: "running", deadline_at: config.deadlineAt, result: {}, error_code: "" };
const input = { contract_id: config.contractId, assigned_to_user_id: config.assigneeId, title: "Review renewal notice deadline", description: "Confirm whether to renew before sending notice. This task does not send notice or resolve the renewal.", due_at: config.dueAt, evidence_id: "evidence-1", deadline_basis: null };

test("creates a run, retrieves evidence, proposes once, and waits for human approval", async () => {
  const calls = [];
  const messages = [];
  const client = {
    createRun: async (payload) => { calls.push("run"); assert.equal(payload.idempotency_key, config.runKey); assert.equal(payload.success_condition.due_at, config.dueAt); return run; },
    actions: async () => { calls.push("actions"); return []; },
    retrieveEvidence: async () => { calls.push("evidence"); return { id: "evidence-1", version_id: "version-1" }; },
    proposeAction: async (_run, payload) => { calls.push("proposal"); assert.equal(payload.idempotency_key, config.actionKey); assert.equal(payload.input.evidence_id, "evidence-1"); return { id: "action-1", status: "awaiting_approval" }; },
    pollRun: async (_run, options) => { calls.push("poll"); assert.equal(options.deadlineAt, run.deadline_at); return { ...run, status: "succeeded", result: { verified: true, task_id: "task-1" } }; },
  };
  await createRenewalFollowUp(client, config, { log: (message) => messages.push(message) });
  assert.deepEqual(calls, ["run", "actions", "evidence", "proposal", "poll"]);
  assert.ok(messages.some((message) => message.includes("agent cannot approve itself")));
  assert.ok(messages.some((message) => message.includes("renewal itself is not handled")));
  assert.ok(messages.every((message) => !message.includes(env.LENSLAYER_AGENT_TOKEN)));
});

test("restart reuses the recorded action without changing its evidence receipt", async () => {
  const client = {
    createRun: async () => run,
    actions: async () => [{ id: "action-1", idempotency_key: config.actionKey, status: "queued", input }],
    retrieveEvidence: () => assert.fail("Do not replace the receipt"), proposeAction: () => assert.fail("Do not change the invocation"),
    pollRun: async () => ({ ...run, status: "succeeded", result: { verified: true, task_id: "task-1" } }),
  };
  assert.equal((await createRenewalFollowUp(client, config, { log: () => {} })).status, "succeeded");
});

test("changed restart input is refused instead of reusing a differently-bound action key", async () => {
  const client = { createRun: async () => run, actions: async () => [{ id: "action-1", idempotency_key: config.actionKey, input: { ...input, title: "Different action" } }] };
  await assert.rejects(createRenewalFollowUp(client, config, { log: () => {} }), /different task input/);
});

test("a terminal replay does not retrieve or propose more work", async () => {
  const client = { createRun: async () => ({ ...run, status: "cancelled" }), actions: () => assert.fail("Terminal") };
  assert.equal((await createRenewalFollowUp(client, config, { log: () => {} })).status, "cancelled");
});
