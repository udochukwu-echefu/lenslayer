import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSession } from "next-auth/react";

vi.mock("next-auth/react", () => ({ getSession: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS", "false");
  vi.mocked(getSession)
    .mockReset()
    .mockResolvedValue({ accessToken: "test-token", expires: "2099-01-01" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("domain API transport", () => {
  it("serializes JSON updates with authentication", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "task-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    await api.updateTask("org-1", "task-1", { status: "done" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/platform/api/v1/organizations/org-1/tasks/task-1");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ status: "done" });
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(options.headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("leaves multipart boundaries to the browser", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    const body = new FormData();
    body.set("file", new File(["Contract"], "contract.txt"));
    await api.createContract("org-1", body);
    expect(fetchMock.mock.calls[0][1].body).toBe(body);
    expect(fetchMock.mock.calls[0][1].headers.has("Content-Type")).toBe(false);
  });

  it("coalesces concurrent session lookups for dashboard requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(Response.json([]))),
    );
    const { api } = await import("./api");
    await Promise.all([
      api.contracts("org-1"),
      api.tasks("org-1"),
      api.notifications("org-1"),
    ]);
    expect(getSession).toHaveBeenCalledOnce();
  });

  it("loads synthetic data without network calls and keeps workspace creation private", async () => {
    vi.stubEnv("NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS", "true");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "private-org" }));
    vi.stubGlobal("fetch", fetchMock);
    const { api } = await import("./api");
    const organizations = await api.organizations();
    expect(organizations[0].id).toBe("public-workspace");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    await api.createOrganization({
      name: "My workspace",
      slug: "my-workspace",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
