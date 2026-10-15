import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { LensLayerClient } from "../../sdk/dist/index.js";

/** Exactly one immutable submission/replay and readback. No planner, polling or approval. */
export async function submitContextGraph(client, input) {
  const run = await client.createWorkflowGraph(input);
  const graph = await client.graph(run.id);
  if (graph.run_id !== run.id) throw new Error("Graph readback does not match the run.");
  return { run, graph };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Supply one explicit graph JSON file.");
    const bytes = await readFile(process.argv[2]);
    if (bytes.length > 131072) throw new Error("Graph file is too large.");
    const client = new LensLayerClient({ baseUrl: process.env.LENSLAYER_API_URL ?? "", token: process.env.LENSLAYER_AGENT_TOKEN ?? "" });
    delete process.env.LENSLAYER_AGENT_TOKEN;
    const { run, graph } = await submitContextGraph(client, JSON.parse(bytes.toString("utf8")));
    console.log(JSON.stringify({ run_id: run.id, status: run.status, nodes: graph.nodes.map(({ id, action_id, status }) => ({ id, action_id, status })) }));
  } catch {
    console.error("Context graph submission/readback was not confirmed. Check explicit input, scope and API version. Inspect the ledger and reuse identical input/key; do not create replacement actions.");
    process.exitCode = 1;
  }
}
