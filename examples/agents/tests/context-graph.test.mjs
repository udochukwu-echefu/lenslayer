import assert from "node:assert/strict";
import { test } from "node:test";
import { LensLayerClient } from "../../../sdk/dist/index.js";
import { submitContextGraph } from "../context-graph.mjs";
import { graphInput, contextGrants, graphReadback } from "../../../sdk/tests/graph-fixtures.mjs";

test("source-installed graph example submits/replays unchanged graph and original action readback, never inserts actions", async () => {
  const paths = [], payloads = [];
  const client = new LensLayerClient({ baseUrl: "https://fixture.example.test", token: "ll_agent_synthetic_example_graph", fetch: async (url, init) => {
    paths.push(new URL(url).pathname);
    if (url.endsWith("/tools")) return Response.json(contextGrants);
    if (url.endsWith("/workflow-graphs")) { payloads.push(init.body); return Response.json({ id: graphReadback.run_id, status: "awaiting_approval" }); }
    assert.ok(url.endsWith("/graph")); return Response.json(graphReadback);
  } });
  const original = await submitContextGraph(client, graphInput);
  const replay = await submitContextGraph(client, graphInput);
  assert.deepEqual(original.graph.nodes, replay.graph.nodes);
  assert.equal(payloads.length, 2); assert.equal(payloads[0], payloads[1]);
  assert.ok(paths.every((path) => /\/tools$|\/workflow-graphs$|\/graph$/.test(path)));
});
