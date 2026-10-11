import { getSession } from "next-auth/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentFixture } from "@/test/agent-fixtures";

vi.mock("next-auth/react", () => ({ getSession: vi.fn() }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS", "true");
  vi.mocked(getSession).mockReset().mockResolvedValue({ accessToken: "human-jwt-test-only", expires: "2099-01-01" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("human agent API transport", () => {
  it("uses human auth and the real workspace even when public preview is enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([agentFixture]));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    const controller = new AbortController();
    await api.agents("org-1", controller.signal);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/platform/api/v1/organizations/org-1/agents");
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer human-jwt-test-only");
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
  it("serializes exact creation scope with no browser-side agent authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ agent: agentFixture, token: "ll_agent_test_only" }));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    const input = { name: "Agent", allowed_tools: agentFixture.allowed_tools, contract_ids: ["contract-1"], assignee_ids: ["user-1"], expires_at: "2099-01-01T00:00:00Z", require_approval: true, max_actions_per_run: 1 };
    await api.createAgent("org-1", input);
    const options = fetchMock.mock.calls[0][1];
    expect(options.method).toBe("POST");
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual(input);
  });
  it("uses implemented event cursors, retained receipt reads, and human decisions", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({})));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    await api.agentRunEvents("org-1", "run/1", 100, 100);
    await api.agentRunEvidence("org-1", "run/1", "receipt/1");
    await api.decideAgentAction("org-1", "run/1", "action/1", { decision: "rejected", reason: "Incorrect assignment" });
    expect(fetchMock.mock.calls[0][0]).toContain("/agent-runs/run%2F1/events?after_sequence=100&limit=100");
    expect(fetchMock.mock.calls[1][0]).toContain("/agent-runs/run%2F1/evidence/receipt%2F1");
    expect(fetchMock.mock.calls[2][0]).toContain("/actions/action%2F1/approval");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ decision: "rejected", reason: "Incorrect assignment" });
  });
  it("does not contact the backend for synthetic reads and refuses every demo mutation", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    const runs = await api.agentRuns("public-workspace");
    expect(runs[0].id).toBe("synthetic-run");
    expect((await api.agentRunEvents("public-workspace", "synthetic-run", 3)).map((event) => event.sequence)).toEqual([4, 5]);
    expect(() => api.revokeAgent("public-workspace", "synthetic-agent")).toThrow(/read-only/);
    expect(() => api.cancelAgentRun("public-workspace", "synthetic-run")).toThrow(/read-only/);
    expect(() => api.decideAgentAction("public-workspace", "synthetic-run", "synthetic-action", { decision: "approved", reason: "Test" })).toThrow(/read-only/);
    expect(() => api.createAgent("public-workspace", { name: "Agent", allowed_tools: ["documents.retrieve"], contract_ids: ["c"], assignee_ids: ["u"], expires_at: "2099-01-01T00:00:00Z" })).toThrow(/read-only/);
    expect(await api.agentInputRequests("public-workspace", "synthetic-run")).toEqual([]);
    expect(() => api.supplyAgentRunInput("public-workspace", "synthetic-run", "input", { values: { days: 30 } })).toThrow(/read-only/);
    expect(() => api.reconcileAgentAction("public-workspace", "synthetic-run", "action")).toThrow(/read-only/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses exact human input-history/supply and bodyless reconciliation routes", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({})));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    await api.agentInputRequests("org-1", "run/1");
    await api.supplyAgentRunInput("org-1", "run/1", "input/1", { values: { days: 30, confirmed: true } });
    await api.reconcileAgentAction("org-1", "run/1", "action/1");
    expect(fetchMock.mock.calls[0][0]).toContain("/agent-runs/run%2F1/input-requests");
    expect(fetchMock.mock.calls[1][0]).toContain("/input-requests/input%2F1/supply");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ values: { days: 30, confirmed: true } });
    expect(fetchMock.mock.calls[2][0]).toContain("/actions/action%2F1/reconcile");
    expect(fetchMock.mock.calls[2][1].method).toBe("POST");
    expect(fetchMock.mock.calls[2][1].body).toBeUndefined();
    for (const [, options] of fetchMock.mock.calls) expect(options.headers.get("Authorization")).toBe("Bearer human-jwt-test-only");
  });
});
