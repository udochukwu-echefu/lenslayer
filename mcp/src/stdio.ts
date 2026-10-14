#!/usr/bin/env node
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LensLayerClient } from "@lenslayer/agent-sdk";
import { createAgentServer } from "./server.js";

try {
  // Require an explicit target: a missing staging URL must not silently hit a local API.
  const baseUrl = process.env.LENSLAYER_API_URL;
  const token = process.env.LENSLAYER_AGENT_TOKEN;
  delete process.env.LENSLAYER_AGENT_TOKEN;
  if (!baseUrl || !token) throw new Error("Missing process configuration");
  const client = new LensLayerClient({ baseUrl, token });
  serveStdio(() => createAgentServer(client), {
    transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 65536 }),
    onerror: () => console.error('{"event":"protocol_error"}'),
  });
} catch {
  console.error('{"event":"startup_failed","guidance":"Check server-side agent credential and HTTPS or loopback API URL."}');
  process.exitCode = 1;
}
