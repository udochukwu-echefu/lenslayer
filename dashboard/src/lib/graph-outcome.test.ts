import { expect, it } from "vitest";
import type { ContextTaskActionInput, ContextTaskReceipt } from "./agent-types";
import { graphOutcomeVerified } from "./agent-shapes";
import { contextActionFixture, graphFixture, graphRunFixture } from "@/test/context-fixtures";

it("verifies the exact completed-node receipt and rejects forged source, action, plan and status bindings", () => {
  const input = { ...contextActionFixture.input, when: { fact: "needed", value: true, equals: true } } as ContextTaskActionInput;
  const receipt: ContextTaskReceipt = { type: "context_task_created", task_id: "persisted-task", contract_id: null, context_id: input.context_id, assigned_to_user_id: input.assigned_to_user_id, due_at: input.due_at, evidence_id: input.evidence_id, version_id: "source-version", plan_sha256: input.plan_sha256, node_id: input.condition_id, verified: true, verification_method: "database_read_back", verified_at: "2099-10-14T14:01:00Z" };
  const action = { ...contextActionFixture, input, status: "succeeded" as const, result: { ...receipt } };
  const graph = { ...graphFixture, nodes: [{ ...graphFixture.nodes[0], status: "completed" as const }] };
  const run = { ...graphRunFixture, status: "succeeded" as const, result: { type: "graph", verified: true, completed_nodes: { review: { action_id: action.id, result: receipt } }, skipped_node_ids: [] } };
  expect(graphOutcomeVerified(run, graph, [action])).toBe(true);
  for (const changes of [{ context_id: "other-context" }, { contract_id: "invented-contract" }, { evidence_id: "other-proof" }, { plan_sha256: "d".repeat(64) }, { verified: false }, { verification_method: "agent_says_so" }, { node_id: "other-node" }, { due_at: "invalid" }]) {
    const forged = { ...receipt, ...changes };
    expect(graphOutcomeVerified({ ...run, result: { ...run.result, completed_nodes: { review: { action_id: action.id, result: forged } } } }, graph, [{ ...action, result: forged }])).toBe(false);
  }
  expect(graphOutcomeVerified(run, graph, [{ ...action, status: "queued" }])).toBe(false);
  expect(graphOutcomeVerified(run, graph, [{ ...action, run_id: "other-run" }])).toBe(false);
  expect(graphOutcomeVerified(run, { ...graph, nodes: [{ ...graph.nodes[0], status: "ready" }] }, [action])).toBe(false);
  expect(graphOutcomeVerified({ ...run, result: { verified: true } }, graph, [action])).toBe(false);
  expect(graphOutcomeVerified(run, undefined, [action])).toBe(false);
});

it("requires the exact approved false-branch cancelled/zero-attempt action for a skipped node", () => {
  const run = { ...graphRunFixture, status: "succeeded" as const, result: { type: "graph", verified: true, completed_nodes: {}, skipped_node_ids: ["review"] } };
  const graph = { ...graphFixture, nodes: [{ ...graphFixture.nodes[0], status: "skipped" as const }] };
  const action = { ...contextActionFixture, status: "cancelled" as const, error_code: "branch_false", approval_status: "approved" as const, attempts: 0 };
  expect(graphOutcomeVerified(run, graph, [action])).toBe(true);
  expect(graphOutcomeVerified(run, graph, [{ ...action, attempts: 1 }])).toBe(false);
  expect(graphOutcomeVerified(run, graph, [{ ...action, approval_status: "pending" }])).toBe(false);
  expect(graphOutcomeVerified(run, graph, [{ ...action, result: { verified: true } }])).toBe(false);
});
