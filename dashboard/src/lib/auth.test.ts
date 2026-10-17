import { afterEach, describe, expect, it, vi } from "vitest";

import { safeCallbackUrl } from "./auth";

afterEach(() => vi.unstubAllEnvs());

describe("OIDC email connection configuration", () => {
  it("does not treat an email connection name as complete OIDC configuration", async () => {
    vi.stubEnv("AUTH_OIDC_ISSUER", undefined);
    vi.stubEnv("AUTH_OIDC_EMAIL_CONNECTION", "Custom-Email-Database");
    vi.resetModules();
    const { authOptions, oidcConfigured } = await import("./auth");
    expect(oidcConfigured).toBe(false);
    expect(authOptions.providers).toEqual([]);
  });

  it.each([undefined, "", "   ", "Custom-Email-Database", " Custom-Email-Database "])("resolves server setting %s", async (setting) => {
    vi.stubEnv("AUTH_OIDC_EMAIL_CONNECTION", setting);
    vi.resetModules();
    const { oidcEmailConnection } = await import("./auth");
    expect(oidcEmailConnection).toBe(setting?.trim() || "Username-Password-Authentication");
  });

  it("preserves PKCE/state and does not make the provider globally connection-specific", async () => {
    vi.stubEnv("AUTH_OIDC_ISSUER", "https://synthetic-auth.example.test");
    vi.stubEnv("AUTH_OIDC_AUDIENCE", "synthetic-audience");
    vi.stubEnv("AUTH_OIDC_CLIENT_ID", "synthetic-client");
    vi.stubEnv("AUTH_OIDC_CLIENT_SECRET", "synthetic-secret");
    vi.stubEnv("NEXTAUTH_SECRET", "synthetic-session-secret");
    vi.stubEnv("AUTH_OIDC_EMAIL_CONNECTION", "Custom-Email-Database");
    vi.resetModules();
    const { authOptions } = await import("./auth");
    expect(authOptions.providers[0]).toMatchObject({ id: "oidc", checks: ["pkce", "state"] });
    const provider = authOptions.providers[0] as { authorization: { params: Record<string, string> } };
    expect(provider.authorization.params).not.toHaveProperty("connection");
    expect(authOptions.session).toMatchObject({ strategy: "jwt", maxAge: 8 * 60 * 60 });
  });
});

describe("safeCallbackUrl", () => {
  it("keeps local callback paths", () => {
    expect(safeCallbackUrl("/invite/inv_123?source=email")).toBe("/invite/inv_123?source=email");
  });

  it.each(["https://malicious.example", "//malicious.example", "/\\malicious.example", "/%5Cmalicious.example", "/%2F%2Fmalicious.example", "javascript:alert(1)"])(
    "rejects external callback %s",
    (callbackUrl) => {
      expect(safeCallbackUrl(callbackUrl)).toBe("/");
    },
  );

  it("uses a caller-provided fallback", () => {
    expect(safeCallbackUrl(null, "/contracts")).toBe("/contracts");
  });
});
