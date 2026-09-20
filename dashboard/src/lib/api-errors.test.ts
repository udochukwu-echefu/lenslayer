import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

vi.mock("next-auth/react", () => ({ getSession: vi.fn().mockResolvedValue(null) }));

afterEach(() => vi.unstubAllGlobals());

describe("API error responses", () => {
  it.each([
    ["Upstream unavailable", 503, "Upstream unavailable"],
    ["<html>Bad gateway</html>", 502, "Request failed (502)"],
    ["", 500, "Request failed (500)"],
    [JSON.stringify({ detail: "Workspace not found" }), 404, "Workspace not found"],
    [JSON.stringify({ detail: [{ loc: ["body", "title"], msg: "String should have at least 2 characters" }] }), 422, "title: String should have at least 2 characters"],
  ])("preserves status and a readable message for %s", async (body, status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status })));
    const error = await api.organizations(false).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message });
  });
});
