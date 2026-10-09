import assert from "node:assert/strict";
import { test } from "node:test";
import { LensLayerClient, LensLayerHttpError, PollingStoppedError } from "../dist/index.js";
import { run, token } from "./fixtures.mjs";

for (const terminal of ["succeeded", "failed", "cancelled"]) {
  test(`polling stops on ${terminal}, not on awaiting_approval`, async () => {
    let calls = 0;
    const seen = [];
    const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: async () => Response.json({ ...run, status: ["running", "awaiting_approval", terminal][calls++] }) });
    const result = await api.pollRun(run.id, { intervalMs: 1, timeoutMs: 5000, onUpdate: (record) => { seen.push(record.status); } });
    assert.equal(result.status, terminal);
    assert.equal(calls, 3);
    assert.deepEqual(seen, ["running", "awaiting_approval", terminal]);
  });
}

test("a known elapsed deadline prevents the first poll", async () => {
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: () => assert.fail("Deadline already elapsed") });
  await assert.rejects(api.pollRun(run.id, { deadlineAt: "2020-01-01T00:00:00Z" }), (error) => error instanceof PollingStoppedError && error.reason === "deadline");
});

test("a server deadline stops further polls without assuming success", async () => {
  let calls = 0;
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: async () => { calls++; return Response.json({ ...run, deadline_at: "2020-01-01T00:00:00Z" }); } });
  await assert.rejects(api.pollRun(run.id, { intervalMs: 1 }), (error) => error instanceof PollingStoppedError && error.reason === "deadline");
  assert.equal(calls, 1);
});

test("the total polling timeout aborts an in-flight HTTP request", { timeout: 5000 }, async () => {
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  }) });
  // Keep a ref'ed safety timer: AbortSignal.timeout itself is intentionally unref'ed in Node.
  const safety = setTimeout(() => assert.fail("Polling did not stop"), 4000);
  try { await assert.rejects(api.pollRun(run.id, { timeoutMs: 20 }), (error) => error instanceof PollingStoppedError && error.reason === "timeout"); } finally { clearTimeout(safety); }
});

test("authorization failure ends polling immediately", async () => {
  let calls = 0;
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: async () => { calls++; return Response.json({ detail: "Revoked" }, { status: 401 }); } });
  await assert.rejects(api.pollRun(run.id), LensLayerHttpError);
  assert.equal(calls, 1);
});

test("an asynchronous progress callback cannot defeat the polling budget", { timeout: 5000 }, async () => {
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: async () => Response.json(run) });
  const safety = setTimeout(() => assert.fail("The update callback defeated the polling budget"), 4000);
  try {
    await assert.rejects(api.pollRun(run.id, { timeoutMs: 20, onUpdate: () => new Promise(() => {}) }), (error) => error instanceof PollingStoppedError && error.reason === "timeout");
  } finally { clearTimeout(safety); }
});

test("an already-aborted caller signal never starts polling", async () => {
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: () => assert.fail("Aborted") });
  await assert.rejects(api.pollRun(run.id, { signal: AbortSignal.abort() }), { name: "AbortError" });
});

test("timezone-free polling deadlines are rejected", async () => {
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: () => assert.fail("Invalid date") });
  await assert.rejects(api.pollRun(run.id, { deadlineAt: "2099-01-01T09:00:00" }), /timezone/);
});
