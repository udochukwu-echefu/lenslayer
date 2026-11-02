import { afterEach, expect, it, vi } from "vitest";

const scheduled = vi.hoisted(() => [] as (() => Promise<unknown>)[]);
vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => { scheduled.push(task); } }));

afterEach(() => { scheduled.length = 0; vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("pings the API's readiness check after the response, and swallows failures", async () => {
  vi.stubEnv("PLATFORM_API_URL", "https://api.example.test/");
  const fetcher = vi.fn().mockRejectedValue(new Error("cold"));
  vi.stubGlobal("fetch", fetcher);
  const { wakePlatformApi } = await import("./platform-wake.server");
  wakePlatformApi();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(scheduled[0]()).resolves.toBeUndefined();
  expect(fetcher).toHaveBeenCalledWith("https://api.example.test/health/ready", expect.objectContaining({ cache: "no-store" }));
});

it("does nothing without a configured API", async () => {
  vi.stubEnv("PLATFORM_API_URL", "");
  const { wakePlatformApi } = await import("./platform-wake.server");
  wakePlatformApi();
  expect(scheduled).toHaveLength(0);
});
