import assert from "node:assert/strict";
import { test } from "node:test";
import { configurationFromEnv } from "../config.mjs";

import { env } from "./fixtures.mjs";

test("configuration uses explicit instants and does not infer date assumptions", () => {
  const config = configurationFromEnv(env);
  assert.equal(config.dueAt, "2099-10-30T09:00:00.000Z");
  assert.equal(config.deadlineBasis, undefined);
  assert.equal(config.runKey, "run-key");
});

for (const name of ["LENSLAYER_CONTRACT_ID", "LENSLAYER_ASSIGNEE_ID", "LENSLAYER_DUE_AT", "LENSLAYER_DEADLINE_AT", "LENSLAYER_RUN_KEY", "LENSLAYER_ACTION_KEY"]) {
  test(`missing ${name} fails before any request`, () => assert.throws(() => configurationFromEnv({ ...env, [name]: "" }), new RegExp(name)));
}

test("requires timezones and rejects impossible calendar dates", () => {
  for (const date of ["2099-10-30T09:00:00", "2099-02-30T09:00:00Z"]) assert.throws(() => configurationFromEnv({ ...env, LENSLAYER_DUE_AT: date }), /timezone/);
});

test("requires paired factual date-arithmetic inputs", () => {
  assert.throws(() => configurationFromEnv({ ...env, LENSLAYER_RENEWAL_DATE: "2099-11-29" }), /both/);
  const config = configurationFromEnv({ ...env, LENSLAYER_RENEWAL_DATE: "2099-11-29", LENSLAYER_NOTICE_DAYS: "30" });
  assert.deepEqual(config.deadlineBasis, { renewal_date: "2099-11-29", notice_days: 30 });
  assert.throws(() => configurationFromEnv({ ...env, LENSLAYER_RENEWAL_DATE: "2099-11-29", LENSLAYER_NOTICE_DAYS: "29" }), /does not match/);
});

test("validation errors never echo the token or the supplied value", () => {
  assert.throws(() => configurationFromEnv({ ...env, LENSLAYER_DUE_AT: env.LENSLAYER_AGENT_TOKEN }), (error) => !error.message.includes(env.LENSLAYER_AGENT_TOKEN));
});
