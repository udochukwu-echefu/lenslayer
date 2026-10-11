import assert from "node:assert/strict";
import { test } from "node:test";
import { LensLayerClient, LensLayerProtocolError } from "../dist/index.js";
import { event, run, token } from "./fixtures.mjs";

test("event pagination advances after_sequence, sorts, and suppresses overlaps", async () => {
  const cursors = [];
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: async (url) => {
    const cursor = Number(new URL(url).searchParams.get("after_sequence"));
    cursors.push(cursor);
    const pages = { 0: [event(2), event(1)], 2: [event(2), event(3)], 3: [event(4)] };
    return Response.json(pages[cursor]);
  } });
  const events = [];
  for await (const entry of api.iterateEvents(run.id, { limit: 2 })) events.push(entry.sequence);
  assert.deepEqual(events, [1, 2, 3, 4]);
  assert.deepEqual(cursors, [0, 2, 3]);
});

test("a full page that does not advance fails rather than looping forever", async () => {
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: async () => Response.json([event(1)]) });
  await assert.rejects(async () => { for await (const _entry of api.iterateEvents(run.id, { limit: 1, afterSequence: 1 })) { /* consume */ } }, LensLayerProtocolError);
});

test("maxPages bounds a constantly-growing event stream", async () => {
  let calls = 0;
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: async () => Response.json([event(++calls)]) });
  await assert.rejects(async () => { for await (const _entry of api.iterateEvents(run.id, { limit: 1, maxPages: 2 })) { /* consume */ } }, /maxPages/);
  assert.equal(calls, 2);
});

test("pagination validates the implemented backend bounds before HTTP", () => {
  const api = new LensLayerClient({ baseUrl: "https://example.com", token, fetch: () => assert.fail("Must not send") });
  assert.throws(() => api.events(run.id, { limit: 201 }), RangeError);
  assert.throws(() => api.events(run.id, { afterSequence: -1 }), RangeError);
  assert.throws(() => api.listRuns({ limit: 101 }), RangeError);
});
