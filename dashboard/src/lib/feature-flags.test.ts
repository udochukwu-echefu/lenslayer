import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it("freezes the agent platform and converter unless their flags are set", async () => {
  const off = await import("./feature-flags");
  expect(off.features).toEqual({ agentPlatform: false, documentConverter: false });
  for (const path of ["/agents", "/agents/runs", "/agent-tasks/abc", "/runs/1", "/context", "/convert"]) expect(off.isFrozenPath(path)).toBe(true);
  for (const path of ["/", "/contracts", "/contracts/new", "/portfolio", "/calendar", "/tasks", "/settings/general", "/team"]) expect(off.isFrozenPath(path)).toBe(false);

  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_LENSLAYER_AGENT_PLATFORM", "1");
  const on = await import("./feature-flags");
  expect(on.isFrozenPath("/agents/runs")).toBe(false);
  expect(on.isFrozenPath("/convert")).toBe(true);
});
