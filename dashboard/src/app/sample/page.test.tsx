import { expect, it } from "vitest";
import SampleReviewPage from "./page";

it("redirects the legacy sample route to the workspace without rendering a tour", () => {
  expect(() => SampleReviewPage()).toThrow(
    expect.objectContaining({ digest: "NEXT_REDIRECT;replace;/;307;" }),
  );
});
