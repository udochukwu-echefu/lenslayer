import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { AppText, Avatar, Badge, Button, confirm, Icon, ListRow, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { titleCase } from "@/lib/format";
import { useMembers } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { space } from "@/theme/tokens";

/**
 * Settings home. Two groups, split by whose setting it is: the workspace's
 * (shared with the team, role-gated) and yours on this phone. The value on the
 * right of a row shows the current setting so you rarely need to open it.
 */
export default function SettingsScreen() {
  const styles = useStyles();
  const { colors, preference } = useTheme();
  const { signOut } = useAuth();
  const { user, activeOrganization, organizationId, activeRole, canManageTeam } = useWorkspace();
  const members = useMembers(organizationId);
  const settings = useQuery({ queryKey: ["organization-settings", organizationId], queryFn: () => api.organizationSettings(organizationId), enabled: Boolean(organizationId) });
  const open = (section: string) => router.push({ pathname: "/settings/[section]", params: { section } });
  const retention = settings.data?.default_retention_days;

  return (
    <Screen contentStyle={{ gap: space.xl - 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => open("profile")} style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
        <Avatar name={user?.display_name || user?.email || "You"} size={46} tint={colors.decisions} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>{user?.display_name || "Your profile"}</AppText>
          <AppText variant="small" tone="muted" numberOfLines={1}>{user?.email}</AppText>
        </View>
        <Icon name="chevronRight" size={13} color={colors.faint} />
      </Pressable>

      <View style={styles.group}>
        <View style={styles.head}>
          <AppText variant="eyebrow" tone="muted" style={styles.flex} numberOfLines={1}>{activeOrganization?.name ?? "Workspace"}</AppText>
          <Badge label={titleCase(activeRole ?? "member")} />
        </View>
        <ListRow icon="building" title="Workspace" onPress={() => open("general")} />
        <ListRow icon="people" title="Team" value={members.data ? String(members.data.length) : undefined} onPress={() => router.push("/settings/team")} />
        <ListRow icon="data" title="Data & retention" value={retention ? (retention === 365 ? "1 year" : `${retention} days`) : undefined} onPress={() => open("data")} />
        {canManageTeam ? <ListRow icon="shield" title="Security & API keys" onPress={() => open("security")} /> : null}
        <ListRow icon="link" title="Integrations" onPress={() => open("integrations")} last />
      </View>

      <View style={styles.group}>
        <AppText variant="eyebrow" tone="muted" style={styles.label}>You, on this phone</AppText>
        <ListRow icon="bell" title="Notifications" onPress={() => open("notifications")} />
        <ListRow icon="appearance" title="Appearance" value={titleCase(preference)} onPress={() => open("appearance")} />
        <ListRow icon="info" title="About & legal" value={Constants.expoConfig?.version} onPress={() => open("about")} last />
      </View>

      <Button label="Sign out" variant="ghost" style={styles.signOut}
        onPress={async () => { if (await confirm("Sign out of LensLayer?", "Downloaded exports stay in Files.", "Sign out")) void signOut(); }} />
    </Screen>
  );
}

const useStyles = createStyles(() => ({
  profile: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: space.xs },
  pressed: { opacity: 0.6 },
  flex: { flex: 1, gap: space.xxs },
  group: {},
  head: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 28, marginBottom: space.xs },
  label: { marginBottom: space.xs },
  signOut: { minHeight: 44 },
}));
