import { beforeEach, expect, it, vi } from "vitest";
import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { authOptions } from "./auth";
import { readPrivateWorkspaceSession } from "./trusted-session.server";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "synthetic-cookie" }) }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("./auth", () => ({ authOptions: { callbacks: { jwt: vi.fn() } } }));

let expires: number;
beforeEach(() => {
  vi.mocked(authOptions.callbacks!.jwt!).mockClear();
  expires = Date.now() + 3600_000;
  vi.mocked(getServerSession).mockImplementation(async (...args) => {
    const options = args[0] as NextAuthOptions;
    const token = { sub: "synthetic-user", exp: Math.floor(Date.now() / 1000) + 7200, accessToken: "synthetic-server-only-bearer",
      accessTokenExpires: expires, browserSessionId: "1c34b57c-32b2-4bea-80d3-a0b5c903182d" };
    const unchanged = await options.callbacks!.jwt!({ token } as never);
    expect(unchanged).toBe(token);
    return options.callbacks!.session!({ token, session: { user: { name: "Synthetic reviewer" }, expires: "2099-01-01" } } as never) as never;
  });
});

it("does not rotate provider refresh grants in a read-only server component", async () => {
  const result = await readPrivateWorkspaceSession();
  expect(authOptions.callbacks!.jwt).not.toHaveBeenCalled();
  expect(result.session?.user?.id).toBe("synthetic-user");
  expect(JSON.stringify(result.session)).not.toContain("synthetic-server-only-bearer");
  expect(result.trusted?.accessToken).toBe("synthetic-server-only-bearer");
});

it("defers near-expiry refresh to the session route instead of seeding signed-out state", async () => {
  expires = Date.now() + 30_000;
  expect(await readPrivateWorkspaceSession()).toEqual({ session: undefined, trusted: null });
  expect(authOptions.callbacks!.jwt).not.toHaveBeenCalled();
});
