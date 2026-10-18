import { getSession } from "next-auth/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ getSession: vi.fn() }));
const session = { user: { id: "synthetic-account" }, expires: "2099-01-01" };
beforeEach(() => {
  vi.resetModules(); vi.stubEnv("NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS", "false");
  vi.mocked(getSession).mockReset().mockResolvedValue(session);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json([]))));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("removes only the proven redundant preflight after a safe SessionProvider seed", async () => {
  const { request, seedAuthenticatedSession } = await import("./api/client");
  seedAuthenticatedSession(session);
  await Promise.all([request("/me"), request("/organizations"), request("/organizations/org/tasks")]);
  expect(getSession).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(3);
});

it("keeps hosted/fresh policy and same-origin mutation CSRF even when seeded", async () => {
  const { request, seedAuthenticatedSession } = await import("./api/client");
  seedAuthenticatedSession(session);
  await request("/organizations/org/hosted-tasks", { method: "POST" }, false, "fresh");
  expect(getSession).toHaveBeenCalledOnce();
  const init = vi.mocked(fetch).mock.calls[0][1]!;
  expect(new Headers(init.headers).get("X-LensLayer-Platform-CSRF")).toBe("1");
  expect(new Headers(init.headers).has("Authorization")).toBe(false); expect(init.cache).toBe("no-store");
});

it("retains the 30-second cache limit and coalesces the subsequent refresh", async () => {
  vi.useFakeTimers();
  const { request, seedAuthenticatedSession } = await import("./api/client");
  seedAuthenticatedSession(session); vi.advanceTimersByTime(29_999);
  await request("/me"); expect(getSession).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  await Promise.all([request("/me"), request("/organizations")]);
  expect(getSession).toHaveBeenCalledOnce();
});

it("does not reuse expired or refresh-error session hints", async () => {
  const { request, seedAuthenticatedSession } = await import("./api/client");
  seedAuthenticatedSession({ ...session, expires: "2001-01-01" }); await request("/me");
  seedAuthenticatedSession({ ...session, error: "RefreshAccessTokenError" }); await request("/me");
  expect(getSession).toHaveBeenCalledTimes(2);
});

it("rejects a late old-account preflight before it can perform a mutation under a new account", async () => {
  let resolve!: (value: typeof session) => void;
  vi.mocked(getSession).mockReturnValue(new Promise((r) => { resolve = r; }));
  const { request, seedAuthenticatedSession } = await import("./api/client");
  const pending = request("/organizations/org/tasks", { method: "POST" }, false, "fresh");
  seedAuthenticatedSession({ ...session, user: { id: "another-account" } }); resolve(session);
  await expect(pending).rejects.toMatchObject({ status: 401 }); expect(fetch).not.toHaveBeenCalled();
  await request("/me"); expect(getSession).toHaveBeenCalledOnce();
});

it("does not preflight exact anonymous shared/invitation previews, but does for accept and lookalikes", async () => {
  const { request } = await import("./api/client");
  await request("/shared/synthetic"); await request("/invitations/synthetic");
  expect(getSession).not.toHaveBeenCalled();
  await request("/invitations/synthetic/accept", { method: "POST" });
  expect(getSession).toHaveBeenCalledOnce();
});

it("invalidates the session hint on private 401, not an unavailable public invitation", async () => {
  const listener = vi.fn(); window.addEventListener("lenslayer:session-invalidated", listener);
  try {
    const { request, seedAuthenticatedSession } = await import("./api/client");
    seedAuthenticatedSession(session);
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(Response.json({ detail: "Sign in" }, { status: 401 })));
    await expect(request("/invitations/synthetic")).rejects.toMatchObject({ status: 401 }); expect(listener).not.toHaveBeenCalled();
    await expect(request("/me")).rejects.toMatchObject({ status: 401 }); expect(listener).toHaveBeenCalledOnce();
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(Response.json([])));
    await request("/me"); expect(getSession).toHaveBeenCalledOnce();
  } finally { window.removeEventListener("lenslayer:session-invalidated", listener); }
});
