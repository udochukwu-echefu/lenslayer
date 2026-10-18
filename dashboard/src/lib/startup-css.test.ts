import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("retains all public-owned and shared declarations in generated style subsets", () => {
  expect(() => execFileSync(process.execPath, [resolve(process.cwd(), "../scripts/extract-startup-css.mjs"), "--check"])).not.toThrow();
});
