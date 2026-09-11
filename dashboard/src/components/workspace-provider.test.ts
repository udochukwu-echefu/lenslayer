import { describe, expect, it } from "vitest";
import { resolveWorkspaceAccess } from "./workspace-provider";

describe("resolveWorkspaceAccess", () => {
  it("keeps authenticated visitors in the demo workspace when public access is enabled", () => {
    expect(resolveWorkspaceAccess(true, "authenticated")).toEqual({
      useDemoWorkspace: true,
      canLoadWorkspace: true,
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
