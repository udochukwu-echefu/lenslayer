import { describe, expect, it, vi } from "vitest";

import { resolveAuthenticatedSession, resolvePlatformApiPrefix } from "./api";

describe("resolvePlatformApiPrefix", () => {
  it("uses the Cloud Run origin without leaving a double slash", () => {
    expect(resolvePlatformApiPrefix("https://lenslayer-api.example.run.app/"))
      .toBe("https://lenslayer-api.example.run.app/api/v1");
  });

  it("keeps the server proxy fallback for local development", () => {
    expect(resolvePlatformApiPrefix()).toBe("/api/platform/api/v1");
  });
});

describe("resolveAuthenticatedSession", () => {
  it("retries once when the access token is still hydrating", async () => {
    const getCurrentSession = vi
      .fn()
      .mockResolvedValueOnce({ user: { name: "Udo" } })
      .mockResolvedValueOnce({ accessToken: "ready-token" });
    const pause = vi.fn().mockResolvedValue(undefined);

    const session = await resolveAuthenticatedSession(getCurrentSession, pause);

    expect(session?.accessToken).toBe("ready-token");
    expect(getCurrentSession).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledOnce();
  });

  it("does not delay when the token is already available", async () => {
    const getCurrentSession = vi.fn().mockResolvedValue({ accessToken: "ready-token" });
    const pause = vi.fn().mockResolvedValue(undefined);

    await resolveAuthenticatedSession(getCurrentSession, pause);

    expect(getCurrentSession).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
  });
});
