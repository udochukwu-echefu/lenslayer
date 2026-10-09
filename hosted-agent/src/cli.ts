#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { LensLayerClient } from "@lenslayer/agent-sdk";
import { FileCheckpointStore } from "./checkpoint.js";
import { OpenAIPlanner } from "./model.js";
import { runFollowUp } from "./runner.js";

try {
  const [configPath, checkpointPath] = process.argv.slice(2);
  if (!configPath || !checkpointPath) throw new Error("usage");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const client = new LensLayerClient({ baseUrl: process.env.LENSLAYER_API_URL ?? "http://127.0.0.1:8000", token: process.env.LENSLAYER_AGENT_TOKEN ?? "" });
  // Construct lazily: a restart observing approval/completion needs no product model key or call.
  const planner = { plan: (input: Parameters<OpenAIPlanner["plan"]>[0], signal: AbortSignal) => new OpenAIPlanner({ enabled: process.env.LENSLAYER_PRODUCT_MODEL_ENABLED === "true", apiKey: process.env.LENSLAYER_PRODUCT_MODEL_API_KEY ?? "", model: process.env.LENSLAYER_PRODUCT_MODEL ?? "" }).plan(input, signal) };
  const store = new FileCheckpointStore(checkpointPath);
  const result = await store.exclusive(() => runFollowUp(client, planner, store, config));
  console.log(JSON.stringify(result)); // allowlisted states/IDs only, never excerpt/plan/error body.
  if (["stopped", "failed", "unsupported"].includes(result.state)) process.exitCode = 1;
} catch {
  console.error('{"state":"stopped","code":"configuration_or_checkpoint_error","usage":"node dist/cli.js config.json checkpoints/run.json"}');
  process.exitCode = 1;
}
