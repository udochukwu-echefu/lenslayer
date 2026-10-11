import { describe, expect, it } from "vitest";
import { actionFixture, eventFixture, runFixture } from "@/test/agent-fixtures";
import { canAdministerAgents, canDecideAction, orderedEvents, runPollInterval } from "./agent-state";

describe("agent permissions and state", () => {
  it.each(["owner", "admin"] as const)("allows %s to administer a private delegation", (role) => {
    expect(canAdministerAgents(role, false)).toBe(true);
    expect(canDecideAction(role, false, runFixture, actionFixture)).toBe(true);
  });
  it.each(["reviewer", "viewer", null] as const)("does not grant approval to %s", (role) => expect(canDecideAction(role, false, runFixture, actionFixture)).toBe(false));
  it("never grants mutations in demo mode, even with an administrator role", () => {
    expect(canAdministerAgents("owner", true)).toBe(false);
    expect(canDecideAction("owner", true, runFixture, actionFixture)).toBe(false);
  });
  it.each(["queued", "running", "succeeded", "failed", "cancelled"] as const)("does not decide an action in %s state", (status) => expect(canDecideAction("owner", false, runFixture, { ...actionFixture, status })).toBe(false));
  it("requires pending approval and an unexpired binding and run", () => {
    expect(canDecideAction("owner", false, runFixture, { ...actionFixture, approval_status: "approved" })).toBe(false);
    expect(canDecideAction("owner", false, runFixture, { ...actionFixture, approval_expires_at: null })).toBe(false);
    expect(canDecideAction("owner", false, runFixture, actionFixture, Date.parse(actionFixture.approval_expires_at!))).toBe(false);
    expect(canDecideAction("owner", false, { ...runFixture, deadline_at: "2020-01-01T00:00:00Z" }, actionFixture)).toBe(false);
  });
  it.each(["succeeded", "failed", "cancelled"] as const)("stops polling and approval when the run is %s", (status) => {
    expect(runPollInterval({ ...runFixture, status }, false)).toBe(false);
    expect(canDecideAction("owner", false, { ...runFixture, status }, actionFixture)).toBe(false);
  });
  it("polls a waiting run but stops for deadline, synthetic data, and missing records", () => {
    expect(runPollInterval({ ...runFixture, status: "awaiting_input" }, false)).toBe(5000);
    expect(canDecideAction("owner", false, { ...runFixture, status: "awaiting_input" }, actionFixture)).toBe(false);
    expect(runPollInterval(runFixture, false)).toBe(5000);
    expect(runPollInterval(runFixture, false, Date.parse(runFixture.deadline_at))).toBe(false);
    expect(runPollInterval(runFixture, true)).toBe(false);
    expect(runPollInterval(undefined, false)).toBe(false);
  });
  it("orders event pages by sequence and displays each overlap once", () => {
    expect(orderedEvents([[eventFixture(2), eventFixture(1)], [eventFixture(2), eventFixture(3)]]).map((event) => event.sequence)).toEqual([1, 2, 3]);
  });
});
