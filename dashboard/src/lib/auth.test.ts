import { describe, expect, it } from "vitest";

import { safeCallbackUrl } from "./auth";

describe("safeCallbackUrl", () => {
  it("keeps local callback paths", () => {
    expect(safeCallbackUrl("/invite/inv_123?source=email")).toBe("/invite/inv_123?source=email");
  });

  it.each(["https://malicious.example", "//malicious.example", "/\\malicious.example", "/%5Cmalicious.example", "/%2F%2Fmalicious.example", "javascript:alert(1)"])(
    "rejects external callback %s",
    (callbackUrl) => {
      expect(safeCallbackUrl(callbackUrl)).toBe("/");
    },
  );

  it("uses a caller-provided fallback", () => {
    expect(safeCallbackUrl(null, "/contracts")).toBe("/contracts");
  });
});
