import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { readWorkspaceBootstrap } from "./workspace-bootstrap.server";
import { readPrivateWorkspaceSession } from "./trusted-session.server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
const token = { sub: "auth0|synthetic", browserSessionId: "1c34b57c-32b2-4bea-80d3-a0b5c903182d", accessToken: "SERVER-ONLY-BEARER", refreshToken: "SERVER-ONLY-REFRESH", accessTokenExpires: Date.now() + 600000, exp: Math.floor(Date.now() / 1000) + 3600 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockResolvedValue(new Headers({ cookie: "synthetic-encrypted-cookie" }) as never);
  vi.mocked(getServerSession).mockImplementation(async (...args) => {
    const config = args[0] as { callbacks: { session: (args: unknown) => Promise<Record<string, unknown>> } };
    const projected = await config.callbacks.session({ token, session: { user: { name: "Synthetic Reviewer", email: "synthetic@example.test" }, expires: "2099-01-01" } });
    delete projected.expires; // NextAuth v4's RSC behavior
    return projected as never;
  });
  vi.stubEnv("PLATFORM_API_URL", "http://127.0.0.1:8999");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("keeps original JWT expiry despite NextAuth RSC stripping, without projecting credentials", async () => {
  const { session, trusted } = await readPrivateWorkspaceSession();
  expect(session?.expires).toBe(new Date(token.exp * 1000).toISOString());
  expect(session?.user?.id).toBe(token.sub);
  expect(trusted?.accessToken).toBe(token.accessToken);
  for (const secret of [token.accessToken, token.refreshToken, token.browserSessionId]) expect(JSON.stringify(session)).not.toContain(secret);
});

it("starts both authorized metadata reads in parallel and hydrates only an explicit safe projection", async () => {
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.cache).toBe("no-store"); expect(init.redirect).toBe("manual");
    expect(init.headers).toEqual({ Authorization: `Bearer ${token.accessToken}` });
    await barrier;
    return Response.json(url.endsWith("/me") ? { id: "user-1", email: "synthetic@example.test", display_name: "Synthetic", api_token: "PRIVATE-EXTRA" } : [
      { id: "org-1", name: "One", slug: "one", role: "owner", created_at: "2026-01-01", secret: "PRIVATE-EXTRA" },
      { id: "org-2", name: "Two", slug: "two", role: "invented-admin", created_at: "2026-01-01" },
    ]);
  });
  vi.stubGlobal("fetch", fetchMock);
  const pending = readWorkspaceBootstrap();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  release();
  const { session, bootstrap } = await pending;
  expect(getServerSession).toHaveBeenCalledOnce();
  expect(bootstrap?.account).toBe(session?.user?.id);
  expect(bootstrap?.organizations.map((o) => o.role)).toEqual(["owner", null]);
  for (const secret of ["PRIVATE-EXTRA", token.accessToken, token.refreshToken, token.browserSessionId]) expect(JSON.stringify({ session, bootstrap })).not.toContain(secret);
});

it("does not read a session or private metadata without a cookie", async () => {
  vi.mocked(headers).mockResolvedValue(new Headers() as never);
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  expect(await readWorkspaceBootstrap()).toEqual({ session: null, bootstrap: null });
  expect(getServerSession).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});

it.each([401, 403, 503])("never hydrates an unsuccessful upstream response (%s) or logs its body", async (status) => {
  const logs = vi.spyOn(console, "error");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "PRIVATE-ERROR-MARKER" }, { status })));
  const result = await readWorkspaceBootstrap();
  expect(result.bootstrap).toBeNull(); expect(JSON.stringify(result)).not.toContain("PRIVATE-ERROR-MARKER"); expect(logs).not.toHaveBeenCalled();
});

it("does not share bootstrap data between requests", async () => {
  let account = "a";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.endsWith("/me") ? { id: account, email: "synthetic@example.test", display_name: account } : [])));
  expect((await readWorkspaceBootstrap()).bootstrap?.user.id).toBe("a"); account = "b";
  expect((await readWorkspaceBootstrap()).bootstrap?.user.id).toBe("b");
  expect(getServerSession).toHaveBeenCalledTimes(2);
});

it("bounds best-effort server hydration and falls back without exposing timed-out responses", async () => {
  vi.useFakeTimers();
  try {
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      expect(ms).toBe(750);
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
      return controller.signal;
    });
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
    })));
    const pending = readWorkspaceBootstrap();
    await vi.advanceTimersByTimeAsync(750);
    const result = await pending;
    expect(result.bootstrap).toBeNull();
    expect(result.session?.user?.id).toBe(token.sub);
    expect(timeout).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
