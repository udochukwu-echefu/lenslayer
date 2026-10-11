import { getSession } from "next-auth/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hostedTaskFixture } from "@/test/hosted-fixtures";

vi.mock("next-auth/react", () => ({ getSession: vi.fn() }));
beforeEach(() => {
  vi.resetModules(); vi.stubEnv("NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS", "true");
  vi.mocked(getSession).mockReset().mockResolvedValue({ accessToken: "human-session-test", expires: "2099-01-01" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses exact human hosted routes with no credential body, cache or implicit preview", async () => {
  const record = { ...hostedTaskFixture, organization_id: "org/1", id: "task/1" };
  const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.includes("?limit=") ? [record] : record)));
  vi.stubGlobal("fetch", fetchMock);
  const { api } = await import("./api");
  const input = { idempotency_key: "stable-request", goal_type: "calendar-event" as const, goal: "Create my exact event", deadline_at: "2099-01-01T00:00:00Z", planner_mode: "deterministic" as const, calendar: { type: "calendar_event_created" as const, connection_id: "connection", calendar_id: "calendar@example.test", summary: "My exact event", start_at: "2099-01-01T09:00:00Z", end_at: "2099-01-01T10:00:00Z" } };
  const controller = new AbortController();
  await api.hostedAgentCapabilities("org/1", controller.signal);
  await api.hostedAgentTasks("org/1", 50, controller.signal);
  await api.hostedAgentTask("org/1", "task/1", controller.signal);
  await api.createHostedAgentTask("org/1", input, controller.signal);
  await api.cancelHostedAgentTask("org/1", "task/1", controller.signal);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/platform/api/v1/organizations/org%2F1/hosted-agent-capabilities",
    "/api/platform/api/v1/organizations/org%2F1/hosted-agent-tasks?limit=50",
    "/api/platform/api/v1/organizations/org%2F1/hosted-agent-tasks/task%2F1",
    "/api/platform/api/v1/organizations/org%2F1/hosted-agent-tasks",
    "/api/platform/api/v1/organizations/org%2F1/hosted-agent-tasks/task%2F1/cancel",
  ]);
  expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual(input);
  expect(fetchMock.mock.calls[4][1].method).toBe("POST"); expect(fetchMock.mock.calls[4][1].body).toBeUndefined();
  for (const [, options] of fetchMock.mock.calls) {
    expect(options.headers.get("Authorization")).toBe("Bearer human-session-test"); expect(options.cache).toBe("no-store"); expect(options.signal).toBe(controller.signal);
  }
});
it("uses existing private contract/member/connection routes despite public-access build settings", async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json([]))); vi.stubGlobal("fetch", fetchMock);
  const { api } = await import("./api"); const controller = new AbortController();
  await api.contracts("org-1", { privateWorkspace: true, signal: controller.signal });
  await api.members("org-1", { privateWorkspace: true, signal: controller.signal });
  await api.integrations("org-1", "google_calendar", { privateWorkspace: true, signal: controller.signal });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/platform/api/v1/organizations/org-1/contracts", "/api/platform/api/v1/organizations/org-1/members", "/api/platform/api/v1/organizations/org-1/integrations?provider=google_calendar"]);
  for (const [, options] of fetchMock.mock.calls) expect(options.signal).toBe(controller.signal);
});
it("refuses all synthetic hosted calls without contacting backend", async () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); const { api } = await import("./api");
  expect(() => api.hostedAgentTasks("public-workspace")).toThrow(/read-only/);
  expect(() => api.hostedAgentCapabilities("public-workspace")).toThrow(/read-only/);
  expect(() => api.hostedAgentTask("public-workspace", "sample")).toThrow(/read-only/);
  expect(() => api.cancelHostedAgentTask("public-workspace", "sample")).toThrow(/read-only/);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("fresh authenticated identity is required even after another request cached a session", async () => {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json([]))); vi.stubGlobal("fetch", fetchMock);
  const { api } = await import("./api"); await api.agents("org-1");
  vi.mocked(getSession).mockResolvedValue(null);
  await expect(api.hostedAgentTasks("org-1")).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("an abort during session hydration prevents a late network write", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof getSession>>) => void;
  vi.mocked(getSession).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); const { api } = await import("./api");
  const controller = new AbortController(); const response = api.cancelHostedAgentTask("org-1", "task", controller.signal);
  controller.abort(); resolve({ accessToken: "late-session", expires: "2099-01-01" });
  await expect(response).rejects.toMatchObject({ name: "AbortError" }); expect(fetchMock).not.toHaveBeenCalled();
});
it("does not automatically retry ambiguous or forbidden hosted writes", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("network failure")); vi.stubGlobal("fetch", fetchMock); const { api } = await import("./api");
  await expect(api.cancelHostedAgentTask("org-1", "task")).rejects.toThrow("network failure"); expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("fails closed on foreign workspace or unexpected task records", async () => {
  const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(url.includes("?limit=") ? [hostedTaskFixture] : hostedTaskFixture)));
  vi.stubGlobal("fetch", fetchMock); const { api } = await import("./api");
  await expect(api.hostedAgentTasks("other-org")).rejects.toMatchObject({ status: 502 });
  await expect(api.hostedAgentTask("org-1", "unexpected-task")).rejects.toMatchObject({ status: 502 });
  await expect(api.cancelHostedAgentTask("other-org", hostedTaskFixture.id)).rejects.toMatchObject({ status: 502 });
});
