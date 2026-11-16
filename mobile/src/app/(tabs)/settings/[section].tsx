import { Stack, useLocalSearchParams } from "expo-router";
import { AboutSection, AppearanceSection, DataSection, GeneralSection, IntegrationsSection, NotificationsSection, ProfileSection, SecuritySection } from "@/components/settings-sections";
import { EmptyState, Screen } from "@/components/ui";
import { space } from "@/theme/tokens";

/**
 * One route for every settings page: /settings/profile, /settings/data and so
 * on. The URL names the section, this file picks the matching component. That
 * keeps deep links from the web ("/settings/security") working unchanged.
 */
const sections = {
  profile: { title: "Profile", Component: ProfileSection },
  general: { title: "Workspace", Component: GeneralSection },
  data: { title: "Data & retention", Component: DataSection },
  security: { title: "Security & access", Component: SecuritySection },
  integrations: { title: "Integrations", Component: IntegrationsSection },
  notifications: { title: "Notifications", Component: NotificationsSection },
  appearance: { title: "Appearance", Component: AppearanceSection },
  about: { title: "About & legal", Component: AboutSection },
} as const;

export default function SettingsSectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const entry = sections[section as keyof typeof sections];
  return (
    <Screen contentStyle={{ gap: space.xl }}>
      <Stack.Screen options={{ title: entry?.title ?? "Settings", headerLargeTitle: true }} />
      {entry ? <entry.Component /> : <EmptyState icon="help" message="That settings page doesn’t exist in the app." />}
    </Screen>
  );
}
