import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function luminance(hex: string) {
  const values = hex.match(/[\da-f]{2}/gi)!.map((value) => parseInt(value, 16) / 255).map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(foreground: string, background: string) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

describe("LensLayer design-system policies", () => {
  it("meets WCAG AA for core semantic text colors", () => {
    const surface = "#FAFBFC";
    expect(contrast("#18243A", surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#4A596C", surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#A3413B", surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#3159B8", surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("does not reintroduce unreadable 8-11px text", () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).not.toMatch(/font-size:\s*(?:8|9|10|11)px/);
  });

  it("keeps primary controls at least 44px", () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain(".button {\n  min-height: 44px");
    expect(css).toContain(".icon-button { width: 44px; height: 44px");
  });

  it("bounds long notification feeds with internal scrolling", () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.notification-scroll\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/s);
  });
});
