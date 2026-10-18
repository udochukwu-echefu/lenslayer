import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
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
  it("starts fetch and forwards upload chunks while the incoming body is still held open", async () => {
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; } }, { highWaterMark: 0 });
    const upload = new Request(request(), { body, duplex: "half" } as RequestInit & { duplex: "half" });
    const bytes = new TextEncoder().encode("first upload chunk");
    let firstChunkRead = false;
    const fetcher = vi.fn(async (_url: string, init: RequestInit & { duplex?: "half" }) => {
      expect(init.body).toBe(upload.body);
      expect(init.duplex).toBe("half");
      expect(init.cache).toBe("no-store");
      expect(init.redirect).toBe("manual");
      // Constructing a real Request also checks Node's streamed-body init requirements.
      const reader = new Request("http://upstream.invalid/upload", init).body!.getReader();
      expect(await reader.read()).toEqual({ done: false, value: bytes });
      firstChunkRead = true;
      expect(await reader.read()).toEqual({ done: true, value: undefined });
      return new Response("uploaded");
    });
    vi.stubGlobal("fetch", fetcher);
    const pending = POST(upload, context);
    try {
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
      source.enqueue(bytes);
      await vi.waitFor(() => expect(firstChunkRead).toBe(true));
    } finally {
      source.close();
    }
    expect(await (await pending).text()).toBe("uploaded");
  });
  it.each(["17", "Wed, 21 Oct 2026 07:28:00 GMT"])("returns an early admission rejection with Retry-After %s without draining the upload", async (retryAfter) => {
    const pull = vi.fn();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller; }, pull }, { highWaterMark: 0 });
    const upload = new Request(request(), { body, duplex: "half" } as RequestInit & { duplex: "half" });
    const fetcher = vi.fn().mockResolvedValue(new Response("Admission limit reached", {
      status: 503,
      headers: {
        "Retry-After": retryAfter, "Content-Type": "text/plain", "Content-Disposition": "inline", "X-Request-ID": "request-safe-123",
        "Cache-Control": "public, max-age=3600", "Set-Cookie": "private=value", "X-Backend-Secret": "private",
      },
    }));
    vi.stubGlobal("fetch", fetcher);
    let response: Response | undefined;
    const pending = POST(upload, context).then((value) => { response = value; return value; });
    try {
      await vi.waitFor(() => expect(response).toBeDefined());
      expect(fetcher.mock.calls[0][1].body).toBe(upload.body);
      expect(pull).not.toHaveBeenCalled();
      expect(upload.bodyUsed).toBe(false);
      expect(response!.status).toBe(503);
      expect(Object.fromEntries(response!.headers)).toEqual({
        "retry-after": retryAfter, "content-type": "text/plain", "content-disposition": "inline", "cache-control": "private, no-store", "x-request-id": "request-safe-123",
      });
      expect(await response!.text()).toBe("Admission limit reached");
    } finally {
      source.close();
      await pending;
    }
  });
  it.each(["unsafe <private>", "a".repeat(129), "private,cookie=value", ""])("filters unsafe backend request IDs (%s)", async (requestId) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("ok", { headers: {
      "X-Request-ID": requestId, "Set-Cookie": "private=value", "X-Backend-Secret": "private",
    } })));
    const outgoing = await POST(request(), context);
    expect(Object.fromEntries(outgoing.headers)).toEqual({ "cache-control": "private, no-store", "content-type": "text/plain;charset=UTF-8" });
  });
  it("forwards streaming bytes before completion and propagates client abort to upstream", async () => {
    const controller = new AbortController();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const upstreamStopped = vi.fn();
    const fetcher = vi.fn().mockImplementation((_url, init) => {
      init.signal.addEventListener("abort", upstreamStopped);
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start(value) { source = value; } }), {
        headers: { "content-type": "application/x-ndjson", "X-Request-ID": "request-stream-123", "Set-Cookie": "private=value", "X-Backend-Secret": "private" },
      }));
    });
    vi.stubGlobal("fetch", fetcher);
    const incoming = new Request(request(), { signal: controller.signal });
    const outgoing = await POST(incoming, context);
    expect(fetcher.mock.calls[0][1].signal).toBe(incoming.signal);
    expect(outgoing.headers.get("Cache-Control")).toBe("private, no-store");
    expect(outgoing.headers.get("X-Accel-Buffering")).toBe("no");
    expect(outgoing.headers.get("X-Request-ID")).toBe("request-stream-123");
    expect(outgoing.headers.has("Set-Cookie")).toBe(false);
    expect(outgoing.headers.has("X-Backend-Secret")).toBe(false);
    const reader = outgoing.body!.getReader();
    source.enqueue(new TextEncoder().encode('{"type":"answer"}\n'));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"answer"');
    controller.abort();
    expect(upstreamStopped).toHaveBeenCalledOnce();
    await reader.cancel();
  });
  it("bridges server cookie credentials without changing API paths; rejects cookie CSRF", async () => {
    vi.mocked(readTrustedSession).mockResolvedValue({ subject: "auth0|fixture", sessionId: "server-session", accessToken: "server-human-bearer" });
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ id: "safe-response" })));
    vi.stubGlobal("fetch", fetcher);
    expect((await POST(request(), context)).status).toBe(200);
    expect(fetcher.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer server-human-bearer");
    vi.mocked(trustedSessionMutationAllowed).mockReturnValue(false);
    const denied = request();
    expect((await POST(denied, context)).status).toBe(403); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(denied.bodyUsed).toBe(false);
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
  it("sanitizes fetch failures while consuming an errored incoming upload stream", async () => {
    const marker = "synthetic-private-upload-body-and-headers";
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      // Real fetch consumes the forwarded stream and rejects if that stream errors.
      await new Response(init.body).arrayBuffer();
      return new Response("unreachable");
    });
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
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1].body).toBe(upload.body);
    expect(logs.mock.calls).toEqual([["Platform API proxy failed"]]);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(marker);
  });
  it("sanitizes an upstream abort rejection and preserves the caller's signal", async () => {
    const controller = new AbortController();
    const marker = "synthetic-private-abort-reason";
    const incoming = new Request(request(), { signal: controller.signal });
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetcher);
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = POST(incoming, context);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort(new Error(marker));
    const response = await pending;
    expect(fetcher.mock.calls[0][1].signal).toBe(incoming.signal);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.has("Retry-After")).toBe(false);
    expect(await response.text()).not.toContain(marker);
    expect(logs.mock.calls).toEqual([["Platform API proxy failed"]]);
  });
  it("keeps bearer authentication and the request header allowlist intact", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetcher);
    const incoming = new Request(request(), { headers: {
      Authorization: "Bearer synthetic-token", "Content-Type": "application/json",
      Cookie: "private=value", "X-LensLayer-User": "spoofed", "X-Private": "private", "X-Request-ID": "spoofed-request",
    } });
    expect((await POST(incoming, context)).status).toBe(200);
    expect(Object.fromEntries(fetcher.mock.calls[0][1].headers)).toEqual({ authorization: "Bearer synthetic-token", "content-type": "application/json" });
    expect(readTrustedSession).not.toHaveBeenCalled();
    expect(trustedSessionMutationAllowed).not.toHaveBeenCalled();
  });
  it.each([false, true])("rejects missing or unreadable production sessions before fetch (throws: %s)", async (throws) => {
    vi.stubEnv("NODE_ENV", "production");
    if (throws) vi.mocked(readTrustedSession).mockRejectedValue(new Error("synthetic-private-session"));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const incoming = request();
    const response = await POST(incoming, context);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: "Sign in to continue." });
    expect(fetcher).not.toHaveBeenCalled();
    expect(incoming.bodyUsed).toBe(false);
  });
  it.each(["GET", "HEAD"])("does not attach a body or duplex to %s requests", async (method) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetcher);
    expect((await GET(new Request(request().url, { method }), context)).status).toBe(200);
    expect(fetcher.mock.calls[0][1].body).toBeUndefined();
    expect(fetcher.mock.calls[0][1].duplex).toBeUndefined();
  });
  it.each(["invitations", "shared"])("preserves public %s previews without forwarding cookie credentials", async (resource) => {
    vi.stubEnv("NODE_ENV", "production");
    const fetcher = vi.fn().mockResolvedValue(new Response("preview"));
    vi.stubGlobal("fetch", fetcher);
    const incoming = new Request(`http://localhost:3000/api/platform/api/v1/${resource}/synthetic?view=preview`, { headers: { Cookie: "private=value" } });
    const response = await GET(incoming, { params: Promise.resolve({ path: ["api", "v1", resource, "synthetic"] }) });
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toBe(`http://127.0.0.1:8000/api/v1/${resource}/synthetic?view=preview`);
    expect(Object.fromEntries(fetcher.mock.calls[0][1].headers)).toEqual({});
    expect(readTrustedSession).not.toHaveBeenCalled();
  });
});
