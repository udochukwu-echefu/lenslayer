import { describe, expect, it } from "vitest";
import { unauthenticatedDestination } from "./workspace-gate";

describe("unauthenticatedDestination", () => {
  it("opens the public demo from the bare app link", () => {
    expect(unauthenticatedDestination("/")).toBe("/sample");
  });

  it("preserves protected deep links through sign in", () => {
    expect(unauthenticatedDestination("/contracts/demo-msa")).toBe(
      "/signin?callbackUrl=%2Fcontracts%2Fdemo-msa",
    );
  });
});
