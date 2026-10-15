import { getSession } from "next-auth/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { contextFixture, contextVersionFixture } from "@/test/context-fixtures";

vi.mock("next-auth/react", () => ({ getSession: vi.fn() }));
beforeEach(() => { vi.resetModules(); vi.stubEnv("NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS", "true"); vi.mocked(getSession).mockResolvedValue({ user: { id: "auth0|synthetic-human" }, expires: "2099-01-01" }); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses only the documented human context/version/narrowing/graph/evidence routes and human authentication", async () => {
  const fetchMock = vi.fn().mockImplementation(async (_url, options) => options.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json(contextFixture));
  vi.stubGlobal("fetch", fetchMock); const { api } = await import("./api");
  const controller = new AbortController();
  await api.contextRecords("org/1", controller.signal);
  await api.contextRecord("org/1", "context/1", controller.signal);
  await api.createContextRecord("org/1", { title: "Brief", text: "Explicit source", expires_at: contextFixture.expires_at }, controller.signal);
  await api.createContextVersion("org/1", "context/1", { expected_version: 3, text: "Replacement source" }, controller.signal);
  await api.contextVersion("org/1", "context/1", 3, controller.signal);
  await api.deleteContextRecord("org/1", "context/1", controller.signal);
  await api.narrowAgentContext("org/1", "agent/1", { context_ids: [] }, controller.signal);
  await api.agentRunGraph("org/1", "run/1", controller.signal);
  await api.agentRunContextEvidence("org/1", "run/1", "evidence/1", controller.signal);
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/api/platform/api/v1/organizations/org%2F1/context-records?limit=50",
    "/api/platform/api/v1/organizations/org%2F1/context-records/context%2F1",
    "/api/platform/api/v1/organizations/org%2F1/context-records",
    "/api/platform/api/v1/organizations/org%2F1/context-records/context%2F1/versions",
    "/api/platform/api/v1/organizations/org%2F1/context-records/context%2F1/versions/3",
    "/api/platform/api/v1/organizations/org%2F1/context-records/context%2F1",
    "/api/platform/api/v1/organizations/org%2F1/agents/agent%2F1/context-scope",
    "/api/platform/api/v1/organizations/org%2F1/agent-runs/run%2F1/graph",
    "/api/platform/api/v1/organizations/org%2F1/agent-runs/run%2F1/context-evidence/evidence%2F1",
  ]);
  expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ expected_version: 3, text: "Replacement source" });
  expect(fetchMock.mock.calls[5][1].method).toBe("DELETE"); expect(fetchMock.mock.calls[5][1].body).toBeUndefined();
  for (const [, options] of fetchMock.mock.calls) {
    expect(options.headers.has("Authorization")).toBe(false);
    expect(options.signal).toBe(controller.signal);
    if (options.method !== "GET" && options.method) expect(options.headers.get("X-LensLayer-Platform-CSRF")).toBe("1");
  }
});

it("does not fetch real sources or permit any context mutation in the public workspace", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); const { api } = await import("./api");
  const [record] = await api.contextRecords("public-workspace");
  expect(record.title).toContain("Relay Software");
  expect((await api.contextVersion("public-workspace", record.id, 1)).text).toContain("Synthetic example only");
  expect(() => api.createContextRecord("public-workspace", { title: "x", text: "x", expires_at: contextFixture.expires_at })).toThrow(/read-only/);
  expect(() => api.createContextVersion("public-workspace", record.id, { expected_version: 1, text: contextVersionFixture.text })).toThrow(/read-only/);
  expect(() => api.deleteContextRecord("public-workspace", record.id)).toThrow(/read-only/);
  expect(() => api.narrowAgentContext("public-workspace", "agent", { context_ids: [] })).toThrow(/read-only/);
  expect(fetchMock).not.toHaveBeenCalled();
});
