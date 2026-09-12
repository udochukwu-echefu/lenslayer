import { describe, expect, it, vi } from "vitest";

import { resolveAuthenticatedSession } from "./api";

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
