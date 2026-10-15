// Parent-operated, credential-free MCP fixture. No OpenCode host, model, HTTP
// listener, real token, process environment lookup or external fetch is used.
import { serveStdio, StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { LensLayerClient } from "@lenslayer/agent-sdk";
import { createAgentServer } from "../dist/server.js";

let discoveries = 0, reads = 0;
const client = new LensLayerClient({
  baseUrl: "https://fixture.invalid", token: "ll_agent_synthetic_opencode_fixture", maxRetries: 0,
  fetch: async (url, init) => {
    const path = new URL(url).pathname;
    if (init.method === "GET" && path === "/api/v1/agent/tools") {
      console.error(JSON.stringify({ event: "fixture_discovery", count: ++discoveries }));
      return Response.json([{ name: "documents.retrieve", version: "1" }]);
    }
    if (init.method === "GET" && path === "/api/v1/agent/runs") {
      console.error(JSON.stringify({ event: "fixture_read", count: ++reads }));
      return Response.json([]);
    }
    return Response.json({}, { status: 403 });
  },
});

serveStdio(() => createAgentServer(client), {
  transport: new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 65536 }),
  onerror: () => console.error('{"event":"protocol_error"}'),
});
