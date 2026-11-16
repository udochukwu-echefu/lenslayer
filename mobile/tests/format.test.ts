/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { dateKey, daysUntil, formatDate, isOverdue, reviewJobMessage } from "../src/lib/format.ts";

test("groups due times by the device's local date", () => {
  const morning = new Date(2026, 10, 16, 8);
  const tonight = new Date(2026, 10, 16, 23, 59);
  const tomorrow = new Date(2026, 10, 17, 0, 1);
  assert.equal(daysUntil(tonight.toISOString(), morning.getTime()), 0);
  assert.equal(daysUntil(tomorrow.toISOString(), morning.getTime()), 1);
  assert.equal(isOverdue(morning.toISOString(), tonight.getTime()), false);
  assert.equal(isOverdue(morning.toISOString(), tomorrow.getTime()), true);
  assert.equal(dateKey(tonight), "2026-11-16");
});

test("invalid dates display a placeholder and never look overdue", () => {
  assert.equal(formatDate("not a date"), "—");
  assert.equal(isOverdue("not a date", Date.now()), false);
});

test("review failures use public copy without displaying raw error details", () => {
  assert.match(reviewJobMessage({ error_code: "SourceRetentionExpired" }), /saved document has expired/);
  assert.equal(reviewJobMessage({ error_code: "private provider details" }), "We couldn’t complete this review. Contact support if you still need it.");
  assert.equal(reviewJobMessage({ error_code: "__proto__" }), reviewJobMessage(undefined));
});
