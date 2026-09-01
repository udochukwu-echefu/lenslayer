import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("Auth0 logout route", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns locally when Auth0 is not configured", () => {
    vi.stubEnv("AUTH_OIDC_ISSUER", "");
    vi.stubEnv("AUTH_OIDC_CLIENT_ID", "");

    const response = GET(new Request("https://workspace.example/auth/logout"));

    expect(response.headers.get("location")).toBe("https://workspace.example/auth/signed-out");
  });

  it("clears the Auth0 SSO session before returning", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://workspace.example");
    vi.stubEnv("AUTH_OIDC_ISSUER", "https://tenant.auth0.com/");
    vi.stubEnv("AUTH_OIDC_CLIENT_ID", "client-123");

    const response = GET(new Request("https://internal-worker.example/auth/logout", { headers: { cookie: "__Secure-next-auth.session-token.0=part-one; __Secure-next-auth.session-token.1=part-two" } }));
    const location = new URL(response.headers.get("location")!);
    const cookies = response.headers.get("set-cookie") ?? "";

    expect(location.origin + location.pathname).toBe("https://tenant.auth0.com/v2/logout");
    expect(location.searchParams.get("client_id")).toBe("client-123");
    expect(location.searchParams.get("returnTo")).toBe("https://workspace.example/auth/signed-out");
    expect(cookies).toContain("__Secure-next-auth.session-token.0=");
    expect(cookies).toContain("__Secure-next-auth.session-token.1=");
    expect(cookies).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });
});
