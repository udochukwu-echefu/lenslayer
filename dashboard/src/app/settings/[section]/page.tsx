import { notFound } from "next/navigation";
import { isSettingsSection } from "@/components/settings/sections";
import { SettingsSection } from "@/components/settings/settings-section";

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isSettingsSection(section)) notFound();
  return <SettingsSection section={section} />;
}
