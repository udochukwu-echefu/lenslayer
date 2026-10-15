import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules(); vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("AUTH_OIDC_ISSUER", "https://synthetic-auth.example.test");
  vi.stubEnv("AUTH_OIDC_CLIENT_ID", "fake-client"); vi.stubEnv("AUTH_OIDC_CLIENT_SECRET", "fake-client-secret");
  vi.stubEnv("AUTH_OIDC_AUDIENCE", "fake-audience"); vi.stubEnv("NEXTAUTH_SECRET", "fake-encryption-key-never-live");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("creates fresh encrypted-token session identity per login but never exposes bearer/session/refresh to browser", async () => {
  const { authOptions } = await import("./auth");
  const jwt = authOptions.callbacks!.jwt!, session = authOptions.callbacks!.session!;
  const token = { sub: "auth0|synthetic", browserSessionId: "old-login", refreshToken: "old-refresh" };
  const first = await jwt({ token: { ...token }, account: { access_token: "fake-product-human-bearer", refresh_token: "fake-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600 } } as never);
  const second = await jwt({ token: { ...first }, account: { access_token: "new-human-bearer" } } as never);
  expect(first.browserSessionId).toMatch(/^[0-9a-f-]{36}$/); expect(first.browserSessionId).not.toBe(second.browserSessionId);
  const refreshed = await jwt({ token: first } as never);
  expect(refreshed.browserSessionId).toBe(first.browserSessionId);
  const browser = await session({ session: { user: {}, accessToken: "stale-browser-bearer" }, token: first } as never);
  expect((browser.user as { id?: string })?.id).toBe("auth0|synthetic");
  for (const value of ["fake-product-human-bearer", "fake-refresh", first.browserSessionId!, "stale-browser-bearer"]) expect(JSON.stringify(browser)).not.toContain(value);
});

it("refresh rotates only server credentials and preserves login identity without logging provider bodies", async () => {
  const { authOptions } = await import("./auth");
  const token = { sub: "auth0|synthetic", browserSessionId: crypto.randomUUID(), accessToken: "old-bearer", refreshToken: "old-refresh", accessTokenExpires: 1 };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ access_token: "rotated-bearer", refresh_token: "rotated-refresh", expires_in: 3600 })));
  const result = await authOptions.callbacks!.jwt!({ token } as never);
  expect(result.browserSessionId).toBe(token.browserSessionId); expect(result.accessToken).toBe("rotated-bearer");
  const logs = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE-TOKEN-MARKER")));
  const failed = await authOptions.callbacks!.jwt!({ token } as never);
  expect(failed.error).toBe("RefreshAccessTokenError"); expect(JSON.stringify(logs.mock.calls)).not.toContain("PRIVATE-TOKEN-MARKER");
});
