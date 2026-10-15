import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const entry = fileURLToPath(new URL("../dist/stdio.js", import.meta.url));
const token = "ll_agent_synthetic_security_only";
const sensitive = { goal: "SYNTHETIC_PRIVATE_GOAL", excerpt: "SYNTHETIC_PRIVATE_SOURCE" };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("real stdio: idle silence, missing/unsupported versions, cross-scope API denial and revocation", { timeout: 15000 }, async () => {
  let grants = [], revoked = false;
  const requests = [];
  const http = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    requests.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (revoked) { res.writeHead(401); res.end(JSON.stringify({ detail: { token, ...sensitive } })); }
    else if (req.url === "/api/v1/agent/tools") res.end(JSON.stringify(grants));
    else { res.writeHead(404); res.end(JSON.stringify({ detail: { token, ...sensitive } })); }
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { LENSLAYER_API_URL: `http://127.0.0.1:${http.address().port}`, LENSLAYER_AGENT_TOKEN: token }, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const client = new Client({ name: "security-stdio", version: "1" });
  try {
    await client.connect(transport);
    const beforeIdle = requests.length;
    await wait(150);
    assert.equal(requests.length, beforeIdle, "No background polling or work when idle");
    for (const grant of [{ name: "workspace.tasks.create" }, { name: "workspace.tasks.create", version: "2" }, { name: "workspace.tasks.create", version: 1 }, { name: "unknown.tool", version: "1" }]) {
      grants = [grant];
      assert.deepEqual((await client.listTools()).tools, []);
      assert.equal((await client.callTool({ name: "runs.status", arguments: { run_id: "other-tenant" } })).isError, true);
    }
    assert.ok(requests.every((request) => request.endsWith("/agent/tools")), "Missing v1 grants must never reach run endpoints");
    grants = [{ name: "documents.retrieve", version: "1" }];
    assert.ok((await client.listTools()).tools.some((tool) => tool.name === "runs.status"));
    let before = requests.length;
    assert.equal((await client.callTool({ name: "runs.status", arguments: { run_id: "other-tenant", tenant_id: "other" } })).isError, true);
    assert.deepEqual(requests.slice(before), ["GET /api/v1/agent/tools"], "Client cannot supply tenant selection");
    const denied = await client.callTool({ name: "runs.status", arguments: { run_id: "other-tenant" } });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied), /http_404/);
    revoked = true; before = requests.length;
    const failed = await client.callTool({ name: "runs.status", arguments: { run_id: "other-tenant" } });
    assert.equal(failed.isError, true);
    assert.deepEqual(requests.slice(before), ["GET /api/v1/agent/tools"], "Revocation after discovery blocks the operation");
    await assert.rejects(client.listTools());
    for (const value of [token, ...Object.values(sensitive)]) {
      assert.ok(!stderr.includes(value));
      assert.ok(!JSON.stringify([denied, failed]).includes(value));
    }
    assert.ok(stderr.trim().split("\n").every((line) => {
      const log = JSON.parse(line);
      return Object.keys(log).sort().join(",") === "outcome,tool" && log.tool === "runs.status" && log.outcome === "error";
    }));
  } finally { await client.close(); await new Promise((resolve) => http.close(resolve)); }
});

test("stdio startup rejects missing/wrong credentials or target without leaking environment values", async () => {
  for (const env of [{}, { LENSLAYER_AGENT_TOKEN: token }, { LENSLAYER_API_URL: "https://fixture.example.test", LENSLAYER_AGENT_TOKEN: "wrong-user-jwt" }, { LENSLAYER_API_URL: "http://remote.example.test", LENSLAYER_AGENT_TOKEN: token }]) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [entry], { env, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", (data) => { stdout += data; });
      child.stderr.on("data", (data) => { stderr += data; });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.stdin.end();
    });
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).event, "startup_failed");
    for (const value of Object.values(env)) assert.ok(!result.stderr.includes(value));
  }
});
