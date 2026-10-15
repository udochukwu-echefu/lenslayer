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
  it("waits once for the safe authenticated identity, not a browser bearer", async () => {
    const getCurrentSession = vi
      .fn()
      .mockResolvedValueOnce({ user: { name: "Udo" } })
      .mockResolvedValueOnce({ user: { id: "auth0|ready-human" } });
    const pause = vi.fn().mockResolvedValue(undefined);

    const session = await resolveAuthenticatedSession(getCurrentSession, pause);

    expect(session?.user?.id).toBe("auth0|ready-human");
    expect(getCurrentSession).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledOnce();
  });

  it("does not delay when the authenticated identity is available", async () => {
    const getCurrentSession = vi.fn().mockResolvedValue({ user: { id: "auth0|ready-human" } });
    const pause = vi.fn().mockResolvedValue(undefined);

    await resolveAuthenticatedSession(getCurrentSession, pause);

    expect(getCurrentSession).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
  });
});
