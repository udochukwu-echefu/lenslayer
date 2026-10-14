import assert from "node:assert/strict";
import { test } from "node:test";
import { LensLayerClient } from "../dist/index.js";
import { contextGrants, graphInput, graphReadback, contextReceipt, invalidGraphs } from "./graph-fixtures.mjs";

const token = "ll_agent_synthetic_graph_only";
const clientFor = (fetch) => new LensLayerClient({ baseUrl: "https://fixture.example.test", token, fetch, retryDelayMs: 0 });

test("graph/context methods use exact additive routes, immutable bodies and fresh version-1 discovery", async () => {
  const requests = []; let attempts = 0;
  const client = clientFor(async (url, init) => {
    requests.push({ path: new URL(url).pathname, method: init.method, body: init.body });
    if (url.endsWith("/tools")) return Response.json(contextGrants);
    if (url.endsWith("/workflow-graphs")) { if (!attempts++) return Response.json({}, { status: 503 }); return Response.json({ id: "graph-run", status: "awaiting_approval" }); }
    if (url.endsWith("/graph")) return Response.json(graphReadback);
    if (url.endsWith("/context-evidence")) return Response.json([contextReceipt]);
    return Response.json({ ...contextReceipt, id: "evidence/1" });
  });
  await client.createWorkflowGraph(graphInput);
  assert.equal((await client.graph("graph-run")).plan_sha256, graphReadback.plan_sha256);
  assert.equal((await client.retrieveContextEvidence("graph-run", { context_ids: ["context-1"], query: "customer onboarding", max_results: 5 }))[0].id, contextReceipt.id);
  assert.equal((await client.readContextEvidence("graph/run", "evidence/1")).id, "evidence/1");
  const creates = requests.filter((r) => r.path.endsWith("/workflow-graphs"));
  assert.equal(creates.length, 2); assert.equal(creates[0].body, creates[1].body); assert.deepEqual(JSON.parse(creates[0].body), graphInput);
  assert.equal(requests.filter((r) => r.path.endsWith("/tools")).length, 4);
  assert.ok(requests.some((r) => r.path === "/api/v1/agent/runs/graph%2Frun/context-evidence/evidence%2F1"));
});

test("pre-run planning search has exact hit shape, bounded read retries and no receipt/write authority", async () => {
  const { id, created_at, ...hit } = contextReceipt;
  void id; void created_at;
  const paths = []; let searches = 0;
  const client = clientFor(async (url, init) => {
    paths.push(new URL(url).pathname);
    if (url.endsWith("/tools")) return Response.json([contextGrants[0]]);
    assert.equal(init.method, "POST"); assert.deepEqual(JSON.parse(init.body), { context_ids: ["context-1"], query: "customer onboarding" });
    return searches++ ? Response.json([hit]) : Response.json({}, { status: 503 });
  });
  const results = await client.searchContext({ context_ids: ["context-1"], query: "customer onboarding" });
  assert.deepEqual(results, [hit]); assert.ok(!("id" in results[0]) && !("created_at" in results[0]));
  assert.deepEqual(paths, ["/api/v1/agent/tools", "/api/v1/agent/context-search", "/api/v1/agent/context-search"]);
});

test("context response guards reject receipt/search confusion, wrong scope, malformed offsets and graph states safely", async () => {
  const { id, created_at, ...hit } = contextReceipt;
  void id; void created_at;
  let data = [contextReceipt];
  const client = clientFor(async (url) => url.endsWith("/tools") ? Response.json(contextGrants) : Response.json(data));
  const search = { context_ids: ["context-1"], query: "onboarding" };
  await assert.rejects(client.searchContext(search), /Unrecognized context\/graph response/);
  data = [hit]; await assert.rejects(client.retrieveContextEvidence("run", search));
  for (const entry of [{ ...hit, context_id: "outside" }, { ...hit, start_offset: -1 }, { ...hit, end_offset: "30" }, { ...hit, source_sha256: "bad" }, { ...hit, excerpt: "x".repeat(4001) }]) { data = [entry]; await assert.rejects(client.searchContext(search)); }
  for (const graph of [{ ...graphReadback, run_id: "other" }, { ...graphReadback, nodes: [{ ...graphReadback.nodes[0], status: "running" }] }, { ...graphReadback, nodes: [{ ...graphReadback.nodes[0], not_before_at: null }] }]) { data = graph; await assert.rejects(client.graph("graph-run")); }
});

test("closed graph boundaries reject unsupported shapes, cycles, scope widening and non-boolean facts before HTTP", async () => {
  let requests = 0; const client = clientFor(async () => { requests++; return Response.json({}); });
  for (const change of invalidGraphs) await assert.rejects(client.createWorkflowGraph(change(structuredClone(graphInput))));
  for (const input of [{ context_ids: [], query: "x" }, { context_ids: ["context-1"], query: "!!!" }, { context_ids: ["context-1"], query: "x", max_results: 11 }, { context_ids: ["context-1"], query: "x", credentials: "forbidden" }]) await assert.rejects(client.retrieveContextEvidence("run", input));
  assert.equal(requests, 0);
});

test("new methods fail closed for missing/unsupported versions, narrowing and revocation; receipts never auto-retry", async () => {
  let grants = contextGrants, revoked = false, posts = 0;
  const client = clientFor(async (url, init) => {
    if (url.endsWith("/tools")) return Response.json(revoked ? { detail: "revoked" } : grants, { status: revoked ? 401 : 200 });
    if (init.method === "POST") posts++;
    return Response.json({}, { status: 503 });
  });
  for (const version of [undefined, "2", 1]) {
    grants = contextGrants.map((g) => ({ ...g, version }));
    await assert.rejects(client.createWorkflowGraph(graphInput));
    await assert.rejects(client.graph("run"));
    await assert.rejects(client.searchContext({ context_ids: ["context-1"], query: "onboarding" }));
  }
  grants = [contextGrants[0]];
  await assert.rejects(client.createWorkflowGraph(graphInput));
  await assert.rejects(client.retrieveContextEvidence("run", { context_ids: ["context-1"], query: "customer" }));
  assert.equal(posts, 1, "Receipt-budget mutation must not retry");
  revoked = true;
  await assert.rejects(client.readContextEvidence("run", "receipt"));
  assert.equal(posts, 1);
});

test("documented no-match/invalid-term/conflict errors preserve status without leaking source or retrying", async () => {
  for (const status of [404, 422, 409]) {
    let calls = 0;
    const client = clientFor(async (url) => {
      if (url.endsWith("/tools")) return Response.json(contextGrants);
      calls++; return Response.json({ detail: `Synthetic error ${token}` }, { status });
    });
    await assert.rejects(status === 409 ? client.createWorkflowGraph(graphInput) : client.searchContext({ context_ids: ["context-1"], query: "onboarding" }), (error) => error.status === status && !JSON.stringify(error).includes(token));
    assert.equal(calls, 1);
  }
});

test("graph instants support timezone-aware minute precision but reject invalid calendar dates and clock times", async () => {
  let creates = 0;
  const client = clientFor(async (url) => {
    if (url.endsWith("/tools")) return Response.json(contextGrants);
    creates++; return Response.json({ id: "graph-run" });
  });
  const input = structuredClone(graphInput);
  input.deadline_at = "2099-10-15T12:00+01:00";
  input.nodes[0].task.due_at = "2099-10-16T12:00Z";
  await client.createWorkflowGraph(input);
  for (const deadline_at of ["2099-02-30T12:00Z", "2099-10-15T24:00Z", "2099-10-15T12:60Z", "2099-10-15T12:00:60Z", "2099-10-15T12:00"]) {
    await assert.rejects(client.createWorkflowGraph({ ...input, deadline_at }));
  }
  assert.equal(creates, 1);
});
