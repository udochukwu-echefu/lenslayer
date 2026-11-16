/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeForWebPath } from "../src/lib/links.ts";

test("contract notifications preserve the agreement and review tab", () => {
  assert.deepEqual(routeForWebPath("/contracts/agreement-a?tab=risks"), { pathname: "/contract/[id]", params: { id: "agreement-a", tab: "risks" } });
  assert.equal(routeForWebPath("/contracts/new"), "/new/contract");
});

test("invitations and task notifications open their mobile destinations", () => {
  assert.deepEqual(routeForWebPath("/invite/sample"), { pathname: "/invite/[token]", params: { token: "sample" } });
  assert.equal(routeForWebPath("/tasks"), "/renewals/tasks");
  assert.equal(routeForWebPath("/calendar"), "/renewals");
});

test("invalid or unsupported notification links open Inbox", () => {
  for (const link of [undefined, "https://[", "/unsupported"]) assert.equal(routeForWebPath(link), "/inbox");
});
