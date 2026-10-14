import { afterEach, expect, it, vi } from "vitest";
import { calendarApi } from "./api/calendar";
afterEach(() => vi.unstubAllGlobals());

it("uses only same-origin cookie BFF with CSRF, no bearer/proof/session/key and no retries", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ id: "connection-1" })));
  vi.stubGlobal("fetch", fetcher);
  await calendarApi.startCalendarConsent("org-1", { display_name: "Synthetic", calendar_id: "owned" });
  await calendarApi.completeCalendarConsent("org-1", { code: "synthetic-code", state: "opaque-state" });
  await calendarApi.disconnectCalendar("org-1", "connection-1");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/calendar/org-1/oauth/start", "/api/calendar/org-1/oauth/callback", "/api/calendar/org-1/connections/connection-1/disconnect"]);
  for (const [, options] of fetcher.mock.calls) {
    expect(options.credentials).toBe("same-origin"); expect(options.cache).toBe("no-store");
    expect(options.headers).toEqual({ "Content-Type": "application/json", "X-LensLayer-Calendar-CSRF": "1" });
  }
  fetcher.mockRejectedValue(new Error("synthetic uncertain exchange"));
  await expect(calendarApi.completeCalendarConsent("org-1", { code: "synthetic", state: "opaque" })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(4);
});
