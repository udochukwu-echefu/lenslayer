/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFrame, QAStreamError, type QAEvent } from "../src/lib/api/qa-frame.ts";

const frame = (seq: number, type: string, payload: object = {}) => JSON.stringify({ seq, request_id: "test-review", type, ...payload });
const answer = { answer: "Payment is due in 30 days. [Source 1]", sources: [{ location: "Page 1", excerpt: "Payment is due in 30 days." }], generated_by: "model" };
const state = () => ({ requestId: "", sequence: 0 });

test("provisional evidence and answer text do not produce a completed answer", () => {
  const stream = state();
  const events: QAEvent[] = [];
  const record = (event: QAEvent) => events.push(event);
  assert.equal(applyFrame(frame(1, "evidence", { sources: answer.sources }), stream, record), null);
  assert.equal(applyFrame(frame(2, "answer", { delta: "Payment is due", provisional: true }), stream, record), null);
  assert.deepEqual(applyFrame(frame(3, "final", { result: answer, completed: true, provisional: false }), stream, record), answer);
  assert.deepEqual(events.map((event) => event.type), ["evidence", "answer", "final"]);
});

test("wrong request IDs, skipped sequences and nonprovisional text are rejected", () => {
  for (const invalid of [
    frame(2, "status", { request_id: "another-request" }),
    frame(3, "status"),
    frame(2, "answer", { delta: "Provisional text", provisional: false }),
  ]) {
    const stream = state();
    applyFrame(frame(1, "status"), stream, () => {});
    assert.throws(() => applyFrame(invalid, stream, () => assert.fail("Invalid event was emitted")), QAStreamError);
  }
});

test("a successful final frame must contain valid citations", () => {
  const result = { ...answer, sources: [{ location: 1, excerpt: "Payment is due in 30 days." }] };
  assert.throws(() => applyFrame(frame(1, "final", { result, completed: true, provisional: false }), state(), () => assert.fail("Invalid answer was emitted")), QAStreamError);
});

test("incomplete final frames prevent completion and expose only known error codes", () => {
  const message = "Private provider exception";
  assert.throws(() => applyFrame(frame(1, "final", { result: answer, completed: false, code: "finalization_failed", message }), state(), () => assert.fail("Incomplete answer was emitted")),
    (error: unknown) => error instanceof QAStreamError && error.code === "finalization_failed" && !error.message.includes(message));
  assert.throws(() => applyFrame(frame(1, "error", { code: "__proto__", message }), state(), () => assert.fail("Error frame was emitted")),
    (error: unknown) => error instanceof QAStreamError && error.code === undefined && !error.message.includes(message));
});
