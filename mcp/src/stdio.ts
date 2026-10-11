#!/usr/bin/env node
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LensLayerClient } from "@lenslayer/agent-sdk";
import { createAgentServer } from "./server.js";

try {
  const client = new LensLayerClient({ baseUrl: process.env.LENSLAYER_API_URL ?? "http://127.0.0.1:8000", token: process.env.LENSLAYER_AGENT_TOKEN ?? "" });
  serveStdio(() => createAgentServer(client), {
    transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 65536 }),
    onerror: () => console.error('{"event":"protocol_error"}'),
  });
} catch {
  console.error('{"event":"startup_failed","guidance":"Check server-side agent credential and HTTPS or loopback API URL."}');
  process.exitCode = 1;
}
