import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { formatRelativeDate } from "@/lib/format";
import { routeForWebPath } from "@/lib/links";
import type { Notification } from "@/lib/shared/types";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import type { ColorTokens } from "@/theme/tokens";
import { space } from "@/theme/tokens";
import { AppText, Icon, type IconName } from "./ui";

/** A plain outline icon; only problems (failed, overdue) take the danger colour. */
function look(kind: string, c: ColorTokens): { icon: IconName; color: string } {
  if (kind.includes("failed")) return { icon: "xCircle", color: c.danger };
  if (kind.includes("overdue")) return { icon: "alert", color: c.danger };
  if (kind.includes("ready") || kind.includes("completed")) return { icon: "checkCircle", color: c.ink };
  if (kind.includes("mention") || kind.includes("comment")) return { icon: "mention", color: c.ink };
  if (kind.includes("contract")) return { icon: "document", color: c.ink };
  return { icon: "renewals", color: c.ink };
}

export function NotificationRow({ notification, onOpen, last }: { notification: Notification; onOpen?: () => void; last?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { icon, color } = look(notification.kind, colors);
  const unread = !notification.read_at;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.message}${unread ? ". Unread" : ""}`}
      onPress={() => { onOpen?.(); router.push(routeForWebPath(notification.action_url)); }}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.icon}><Icon name={icon} size={20} color={color} /></View>
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={2}>{notification.title}</AppText>
        <AppText variant="small" tone="muted" numberOfLines={3}>{notification.message}</AppText>
        <AppText variant="caption" tone="faint">{formatRelativeDate(notification.created_at)}</AppText>
      </View>
      {unread ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
    </Pressable>
  );
}

const useStyles = createStyles((c) => ({
  row: { flexDirection: "row", gap: 14, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  pressed: { opacity: 0.6 },
  icon: { paddingTop: 1 },
  body: { flex: 1, gap: space.xxs },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
}));
