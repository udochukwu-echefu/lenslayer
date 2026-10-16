import { describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";
import SettingsSectionPage from "./[section]/page";
import DevelopersPage from "../developers/page";
import { SettingsSection } from "@/components/settings/settings-section";
import { settingsSections } from "@/components/settings/sections";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => { throw new Error(`redirect:${url}`); }),
  notFound: vi.fn(() => { throw new Error("not-found"); }),
}));
vi.mock("next/navigation", () => ({ ...navigation, usePathname: () => "/settings/general" }));

describe("canonical Settings routes", () => {
  it("redirects /settings to General", () => {
    expect(() => SettingsPage()).toThrow("redirect:/settings/general");
  });
  it("redirects /developers into the workspace Settings guide", () => {
    expect(() => DevelopersPage()).toThrow("redirect:/settings/developers");
  });
  it.each(settingsSections)("renders only the selected $id section", async ({ id }) => {
    const element = await SettingsSectionPage({ params: Promise.resolve({ section: id }) });
    expect(element.type).toBe(SettingsSection);
    expect(element.props).toEqual({ section: id });
  });
  it("refuses an invalid section instead of silently showing/saving General", async () => {
    await expect(SettingsSectionPage({ params: Promise.resolve({ section: "not-a-setting" }) })).rejects.toThrow("not-found");
  });
});
