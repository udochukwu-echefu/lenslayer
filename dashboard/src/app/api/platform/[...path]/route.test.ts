import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { readTrustedSession, trustedSessionMutationAllowed } from "@/lib/trusted-session.server";
vi.mock("@/lib/trusted-session.server", () => ({ readTrustedSession: vi.fn().mockResolvedValue(null), trustedSessionMutationAllowed: vi.fn().mockReturnValue(true) }));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("PLATFORM_API_URL", "http://127.0.0.1:8000");
  vi.mocked(readTrustedSession).mockReset().mockResolvedValue(null);
  vi.mocked(trustedSessionMutationAllowed).mockReset().mockReturnValue(true);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const context = { params: Promise.resolve({ path: ["api", "v1", "organizations", "org-1", "agents"] }) };
const request = () => new Request("http://localhost:3000/api/platform/api/v1/organizations/org-1/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Agent" }) });

describe("credential response proxy", () => {
  it("bridges server cookie credentials without changing API paths; rejects cookie CSRF", async () => {
    vi.mocked(readTrustedSession).mockResolvedValue({ subject: "auth0|fixture", sessionId: "server-session", accessToken: "server-human-bearer" });
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ id: "safe-response" })));
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(request(), context)).status).toBe(200);
    expect(fetcher.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer server-human-bearer");
    vi.mocked(trustedSessionMutationAllowed).mockReturnValue(false);
    expect((await POST(request(), context)).status).toBe(403); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never makes one-time credential responses cacheable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ agent: { id: "agent-1" }, token: "ll_agent_proxy_test_only" }, { status: 201 })));
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await response.json()).token).toBe("ll_agent_proxy_test_only");
  });
  it("does not log a credential-bearing upstream exception", async () => {
    const token = "ll_agent_proxy_test_only";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`Network exception with ${token}`)));
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(request(), context);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(logs).toHaveBeenCalledWith("Platform API proxy failed");
    expect(JSON.stringify(logs.mock.calls)).not.toContain(token);
    expect(await response.text()).not.toContain(token);
  });
  it("sanitizes an errored incoming upload stream without calling upstream", async () => {
    const marker = "synthetic-private-upload-body-and-headers";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new TypeError(marker)); },
    });
    const upload = new Request("http://localhost:3000/api/platform/api/v1/organizations/org-1/contracts", {
      method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=synthetic" },
      body, duplex: "half",
    } as RequestInit & { duplex: string });
    const response = await POST(upload, { params: Promise.resolve({ path: ["api", "v1", "organizations", "org-1", "contracts"] }) });
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ detail: "The LensLayer API is unavailable. Start the platform API and try again." });
    expect(fetcher).not.toHaveBeenCalled();
    expect(logs.mock.calls).toEqual([["Platform API proxy failed"]]);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(marker);
  });
});
