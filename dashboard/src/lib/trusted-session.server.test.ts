import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readTrustedSession, trustedSessionMutationAllowed } from "./trusted-session.server";
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
beforeEach(() => { vi.mocked(headers).mockReset().mockResolvedValue(new Headers({ cookie: "encrypted-synthetic-cookie" }) as never); vi.mocked(getServerSession).mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("requires same-origin CSRF for generic cookie-authenticated API mutations too", () => {
  vi.stubEnv("NEXTAUTH_URL", "https://dashboard.example.test");
  const request = (headers: Record<string, string>) => new Request("https://dashboard.example.test/api/platform/api/v1/tasks", { method: "POST", headers });
  expect(trustedSessionMutationAllowed(request({ Origin: "https://dashboard.example.test", "X-LensLayer-Platform-CSRF": "1" }))).toBe(true);
  expect(trustedSessionMutationAllowed(request({ Origin: "https://evil.example.test", "X-LensLayer-Platform-CSRF": "1" }))).toBe(false);
  expect(trustedSessionMutationAllowed(request({ Origin: "https://dashboard.example.test" }))).toBe(false);
});

it("projects refreshed server token without accepting caller session text; missing cookie and legacy login fail closed", async () => {
  const token = { sub: "auth0|synthetic", browserSessionId: "1c34b57c-32b2-4bea-80d3-a0b5c903182d", accessToken: "server-bearer", accessTokenExpires: Date.now() + 60000 };
  vi.mocked(getServerSession).mockImplementation(async (...args) => {
    const config = args[0] as { callbacks: { session: (args: unknown) => Promise<unknown> } };
    return await config.callbacks.session({ token }) as never;
  });
  expect(await readTrustedSession()).toEqual({ subject: token.sub, sessionId: token.browserSessionId, accessToken: token.accessToken });
  vi.mocked(headers).mockResolvedValue(new Headers() as never);
  expect(await readTrustedSession()).toBeNull();
  vi.mocked(headers).mockResolvedValue(new Headers({ cookie: "encrypted-old-login" }) as never);
  token.browserSessionId = "";
  expect(await readTrustedSession()).toBeNull();
});
