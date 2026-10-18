import { getSession } from "next-auth/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { demoPage, demoWorkspaceQuery } from "./demo-workspace-queries";
import { demoContracts, demoTasksFor } from "./demo-data";
import { overviewWindow } from "./workspace-query-hooks";

vi.mock("next-auth/react", () => ({ getSession: vi.fn() }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS", "true");
  vi.mocked(getSession).mockReset().mockResolvedValue({ user: { id: "synthetic-user" }, expires: "2099-01-01" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("uses bounded additive routes, explicit filters and abort signals, never bearer headers", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ items: [], total: 0, offset: 0, limit: 25 })));
  vi.stubGlobal("fetch", fetcher);
  const { api } = await import("./api");
  const controller = new AbortController();
  await api.queryContracts("org/1", { q: "old supplier", status: "all", sort: "title", descending: false, offset: 25 }, { signal: controller.signal });
  await api.queryTasks("org/1", { status: "open,in_progress", assigned_to_user_id: "user", due_after: "2026-10-18T00:00:00.000Z" });
  await api.queryLifecycle("org/1", { contract_id: "old-record" });
  await api.searchWorkspace("org/1", "supplier");
  await api.queryOverview("org/1", overviewWindow(new Date(2026, 9, 18, 14)));
  expect(fetcher.mock.calls.map(([url]) => new URL(url, "https://test.invalid").pathname)).toEqual(["contracts", "tasks", "lifecycle", "search", "overview"].map((resource) => `/api/platform/api/v1/organizations/org%2F1/query/${resource}`));
  const params = new URL(fetcher.mock.calls[0][0], "https://test.invalid").searchParams;
  expect(Object.fromEntries(params)).toEqual({ q: "old supplier", sort: "title", descending: "false", offset: "25", limit: "25" });
  expect(fetcher.mock.calls[0][1].signal).toBe(controller.signal);
  for (const [, init] of fetcher.mock.calls) { expect(init.cache).toBe("no-store"); expect(init.headers.has("Authorization")).toBe(false); }
});

it("keeps demo query results synthetic and paginated without private network fallback", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const { api } = await import("./api");
  const all = await api.contracts("public-workspace");
  const first = await api.queryContracts("public-workspace", { limit: 2, sort: "title", descending: false });
  const next = await api.queryContracts("public-workspace", { limit: 2, offset: 2, sort: "title", descending: false });
  expect(first.total).toBe(all.length); expect(first.items).toHaveLength(2);
  expect(next.items.some((item) => first.items.some((other) => other.id === item.id))).toBe(false);
  const search = await api.searchWorkspace("public-workspace", "Loopback");
  expect(search.items.length).toBeGreaterThan(0);
  expect(search.items[0]).not.toHaveProperty("excerpt");
  expect(fetcher).not.toHaveBeenCalled(); expect(getSession).not.toHaveBeenCalled();
});

it("requires a fresh session for hosted contract choices even after a cached general read", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ items: [], total: 0, offset: 0, limit: 25 })));
  vi.stubGlobal("fetch", fetcher); const { api } = await import("./api");
  await api.queryContracts("org-1");
  vi.mocked(getSession).mockResolvedValue({ user: { id: "synthetic-user" }, expires: "2099-01-01" });
  await api.queryContracts("org-1", {}, { privateWorkspace: true });
  expect(getSession).toHaveBeenCalledTimes(2);
  vi.mocked(getSession).mockResolvedValue(null);
  await expect(api.queryContracts("org-1", {}, { privateWorkspace: true })).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("aborts before a late session can issue a query", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof getSession>>) => void;
  vi.mocked(getSession).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const { api } = await import("./api");
  const controller = new AbortController();
  const response = api.searchWorkspace("org-1", "old", { signal: controller.signal });
  controller.abort(); resolve({ user: { id: "synthetic-late-user" }, expires: "2099-01-01" });
  await expect(response).rejects.toMatchObject({ name: "AbortError" }); expect(fetcher).not.toHaveBeenCalled();
});

it("filters and stable-sorts the complete synthetic collection before paging", () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({ id: String(index).padStart(4, "0"), status: index % 2 ? "ready" : "failed", title: index > 800 ? "Older relevant agreement" : "Other", updated_at: "2026-01-01" })).reverse();
  const page = demoPage(rows, { q: "Older relevant", status: "ready", sort: "title", offset: 25, limit: 25 }, "updated_at");
  expect(page.total).toBe(100); expect(page.items).toHaveLength(25); expect(page.items[0].id).toBe("0851");
  expect(demoPage(rows, { offset: 2000 }, "updated_at").items).toEqual([]);
  expect(demoPage(rows, { q: "missing" }, "updated_at").total).toBe(0);
});

it("returns complete demo counts with small previews and uses local day boundaries", () => {
  const now = new Date(2026, 9, 18, 14, 23);
  const window = overviewWindow(now);
  expect(new Date(window.day_start).getHours()).toBe(0);
  expect(new Date(window.week_end).getDate()).toBe(25);
  const overview = demoWorkspaceQuery("public-workspace", "overview", window);
  expect(overview).toHaveProperty("counts.contracts", demoContracts.length);
  expect(overview).toHaveProperty("counts.completed_tasks", demoTasksFor(null).filter((task) => task.status === "done").length);
  expect(overview).toHaveProperty("recent_contracts");
  const payload = overview as { recent_contracts: unknown[]; my_tasks: unknown[]; upcoming_tasks: unknown[]; upcoming_lifecycle: unknown[] };
  expect(payload.recent_contracts.length).toBeLessThanOrEqual(5); expect(payload.my_tasks.length).toBeLessThanOrEqual(5);
  expect(payload.upcoming_tasks.length).toBeLessThanOrEqual(4); expect(payload.upcoming_lifecycle.length).toBeLessThanOrEqual(4);
});
