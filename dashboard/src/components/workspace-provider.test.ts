import { describe, expect, it } from "vitest";
import { resolveWorkspaceAccess } from "./workspace-provider";

describe("resolveWorkspaceAccess", () => {
  it("uses the private workspace after an authenticated visitor leaves the public demo", () => {
    expect(resolveWorkspaceAccess(true, "authenticated")).toEqual({
      useDemoWorkspace: false,
      canLoadWorkspace: true,
    });
  });

  it("uses the demo workspace for unauthenticated visitors when public access is enabled", () => {
    expect(resolveWorkspaceAccess(true, "unauthenticated")).toEqual({
      useDemoWorkspace: true,
      canLoadWorkspace: true,
    });
  });

  it("waits for session hydration before choosing a workspace mode", () => {
    expect(resolveWorkspaceAccess(true, "loading")).toEqual({
      useDemoWorkspace: false,
      canLoadWorkspace: false,
    });
  });

  it("uses the private API only when public access is disabled", () => {
    expect(resolveWorkspaceAccess(false, "authenticated")).toEqual({
      useDemoWorkspace: false,
      canLoadWorkspace: true,
    });
  });

  it("does not load a private workspace without a session", () => {
    expect(resolveWorkspaceAccess(false, "unauthenticated")).toEqual({
      useDemoWorkspace: false,
      canLoadWorkspace: false,
    });
  });
});
