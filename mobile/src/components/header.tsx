import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { useNotifications } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { useTheme } from "@/theme/theme-provider";
import { font, space, touch } from "@/theme/tokens";
import { AppText, Icon, type IconName } from "./ui";

/** Shared stack options so every tab's header looks the same. */
export function useStackOptions() {
  const { colors } = useTheme();
  return {
    headerLargeTitle: true,
    headerTransparent: false,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colors.canvas },
    headerLargeStyle: { backgroundColor: colors.canvas },
    headerLargeTitleStyle: { fontFamily: font.bold, color: colors.ink },
    headerTitleStyle: { fontFamily: font.semibold, color: colors.ink },
    headerBackTitleStyle: { fontFamily: font.medium },
    // The tint colours the back link (rose in the design); titles set their own ink colour above.
    headerTintColor: colors.accent,
    headerBackTitle: "Back",
    contentStyle: { backgroundColor: colors.canvas },
  } as const;
}

export function HeaderButton({ icon, label, onPress, badge, disabled }: { icon: IconName; label: string; onPress: () => void; badge?: number; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={8} style={{ width: touch, height: touch, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}>
      <Icon name={icon} size={21} color={colors.ink} />
      {badge ? (
        <View style={{ position: "absolute", top: 6, right: 4, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, backgroundColor: colors.decisions, alignItems: "center", justifyContent: "center" }}>
          <AppText variant="caption" style={{ fontSize: 10, lineHeight: 12, color: colors.onCategory }}>{badge > 9 ? "9+" : String(badge)}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Bell with unread count, plus "upload" for roles that can start reviews. */
export function WorkspaceHeaderActions() {
  const { organizationId, canUpload } = useWorkspace();
  const notifications = useNotifications(organizationId);
  const unread = (notifications.data ?? []).filter((item) => !item.read_at).length;
  return (
    <View style={{ flexDirection: "row", gap: space.xs }}>
      {canUpload ? <HeaderButton icon="plus" label="Upload a contract" onPress={() => router.push("/new/contract")} /> : null}
      <HeaderButton icon="bell" label={`${unread || "No"} unread notifications`} badge={unread} onPress={() => router.push("/notifications")} />
    </View>
  );
}
