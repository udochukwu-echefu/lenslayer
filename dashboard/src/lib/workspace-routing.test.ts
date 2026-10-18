import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps one shared private layout, including the workspace-bound Calendar callback, without changing public paths", () => {
  const app = resolve(process.cwd(), "src/app");
  expect(readFileSync(resolve(app, "(workspace)/layout.tsx"), "utf8")).toContain("@/components/workspace-layout");
  for (const section of ["tasks", "contracts", "agents", "context", "calendar", "portfolio", "inbox", "team", "runs", "reports", "convert", "notifications", "agent-tasks"]) {
    expect(existsSync(resolve(app, `(workspace)/${section}/page.tsx`))).toBe(true);
    expect(existsSync(resolve(app, `(workspace)/${section}/layout.tsx`))).toBe(false);
  }
  expect(existsSync(resolve(app, "(workspace)/calendar/oauth-return/page.tsx"))).toBe(true);
  for (const route of ["sample", "signin", "signup", "auth", "invite", "shared"]) expect(existsSync(resolve(app, `${route}/layout.tsx`))).toBe(true);
  expect(readFileSync(resolve(app, "layout.tsx"), "utf8")).not.toMatch(/readWorkspaceBootstrap|Providers|workspace-layout/);
});
