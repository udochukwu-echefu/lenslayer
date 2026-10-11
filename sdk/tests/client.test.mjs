import assert from "node:assert/strict";
import { test } from "node:test";
import { LensLayerClient, LensLayerHttpError, LensLayerProtocolError, LensLayerTransportError } from "../dist/index.js";
import { actionInput, run, runInput, token } from "./fixtures.mjs";

const client = (fetch, options = {}) => new LensLayerClient({ baseUrl: "http://127.0.0.1:8000", token, fetch, retryDelayMs: 0, ...options });

test("uses the agent bearer boundary and disables redirects and caching", async () => {
  const api = client(async (url, init) => {
    assert.equal(url, "http://127.0.0.1:8000/api/v1/agent/runs");
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
    assert.deepEqual(JSON.parse(init.body), runInput);
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(run, { status: 201 });
  });
  assert.equal((await api.createRun(runInput)).id, run.id);
  assert.equal(JSON.stringify(api), "{}");
});

for (const [name, submit, payload] of [
  ["run", (api, input) => api.createRun(input), runInput],
  ["action", (api, input) => api.proposeAction(run.id, input), actionInput],
]) {
  test(`${name} retries preserve the original key and serialized input`, async () => {
    const original = structuredClone(payload);
    const input = structuredClone(payload);
    const bodies = [];
    const api = client(async (_url, init) => {
      bodies.push(init.body);
      if (bodies.length === 1) {
        input.idempotency_key = "mutated-by-caller";
        return Response.json({ detail: "Temporarily unavailable" }, { status: 503 });
      }
      return Response.json({ id: "original-record" });
    });
    await submit(api, input);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.deepEqual(JSON.parse(bodies[1]), original);
  });
}

for (const status of [400, 401, 403, 404, 409, 422]) {
  test(`does not blindly retry HTTP ${status}`, async () => {
    let calls = 0;
    const api = client(async () => { calls++; return Response.json({ detail: "Denied" }, { status }); });
    await assert.rejects(api.createRun(runInput), (error) => error instanceof LensLayerHttpError && error.status === status);
    assert.equal(calls, 1);
  });
}

test("does not retry non-idempotent evidence retrieval", async () => {
  let calls = 0;
  const api = client(async () => { calls++; throw new Error(`Bad fetch with Bearer ${token}`); });
  await assert.rejects(api.retrieveEvidence(run.id, { contract_id: "contract-1", query: "renew" }), LensLayerTransportError);
  assert.equal(calls, 1);
});

test("retries an ambiguous idempotent mutation, bounded by maxRetries", async () => {
  let calls = 0;
  const api = client(async () => { calls++; throw new Error(token); });
  await assert.rejects(api.proposeAction(run.id, actionInput), (error) => error instanceof LensLayerTransportError && !`${error}${error.stack}`.includes(token));
  assert.equal(calls, 3);
});

test("HTTP errors retain status and safe details but never echoed credentials", async () => {
  const api = client(async () => Response.json({ detail: `Rejected ${token}`, authorization: `Bearer ${token}`, issues: [{ input: token, [token]: "echoed key" }] }, { status: 403, headers: { "x-request-id": "request-1" } }));
  await assert.rejects(api.tools(), (error) => {
    assert.ok(error instanceof LensLayerHttpError);
    assert.equal(error.requestId, "request-1");
    assert.equal(error.status, 403);
    assert.ok(error.message.includes("[redacted]"));
    assert.ok(!JSON.stringify(error).includes(token));
    assert.ok(!error.stack.includes(token));
    return true;
  });
});

test("validation errors have useful messages without reflecting input secrets", async () => {
  const api = client(async () => Response.json({ detail: [{ loc: ["body", "due_at"], msg: "Timezone required", input: token }] }, { status: 422 }));
  await assert.rejects(api.createRun(runInput), (error) => error.message === "Timezone required" && !JSON.stringify(error).includes(token));
});

test("rejects unsafe origins, public API keys, invalid bounds, and browser use", () => {
  for (const baseUrl of ["http://remote.example", "https://user:password@example.com", "https://example.com?secret=yes", "https://example.com#secret"]) assert.throws(() => new LensLayerClient({ baseUrl, token }));
  assert.throws(() => new LensLayerClient({ baseUrl: "https://example.com", token: "ordinary-user-jwt" }));
  assert.throws(() => client(globalThis.fetch, { maxRetries: 20 }), RangeError);
  globalThis.window = {};
  try { assert.throws(() => client(globalThis.fetch), /server-only/); } finally { delete globalThis.window; }
});

test("requires a mutation idempotency key before sending", () => {
  const api = client(() => { assert.fail("Must not send"); });
  assert.throws(() => api.createRun({ ...runInput, idempotency_key: "" }), /idempotency_key/);
  assert.throws(() => api.proposeAction(run.id, { ...actionInput, idempotency_key: " " }), /idempotency_key/);
});

test("supports an API-prefixed URL and safely encodes identifiers", async () => {
  const api = client(async (url) => { assert.equal(url, "https://example.com/api/v1/agent/runs/run%2Fone/evidence/receipt%2Fone"); return Response.json({ id: "receipt" }); }, { baseUrl: "https://example.com/api/v1/" });
  await api.readEvidence("run/one", "receipt/one");
});

test("rejects successful HTML instead of pretending it is a typed API record", async () => {
  const api = client(async () => new Response("<html>login</html>", { status: 200 }));
  await assert.rejects(api.getRun(run.id), LensLayerProtocolError);
});

test("caller cancellation prevents another retry", async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = client(async () => { calls++; controller.abort(); throw new Error("Aborted"); });
  await assert.rejects(api.createRun(runInput, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
});
