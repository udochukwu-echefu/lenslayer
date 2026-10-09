import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("PLATFORM_API_URL", "http://127.0.0.1:8000");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const context = { params: Promise.resolve({ path: ["api", "v1", "organizations", "org-1", "agents"] }) };
const request = () => new Request("http://localhost:3000/api/platform/api/v1/organizations/org-1/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Agent" }) });

describe("credential response proxy", () => {
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
});
