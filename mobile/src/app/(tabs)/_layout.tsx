import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from "expo-router/ui";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText, Icon, type IconName } from "@/components/ui";
import { useTaskCounts } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font } from "@/theme/tokens";

/**
 * The five destinations from the dashboard's sidebar, in a floating pill tab
 * bar (the approved design). Expo Router's headless tabs (`expo-router/ui`)
 * give us the navigation behaviour and leave the drawing to us: `TabSlot`
 * renders the current tab, `TabList` is the bar, and each `TabTrigger` is a
 * button. Every folder holds a Stack, so each tab keeps its own back history.
 */
export default function TabsLayout() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { organizationId } = useWorkspace();
  const counts = useTaskCounts(organizationId);
  const overdue = counts.data?.overdue_tasks ?? 0;

  return (
    <Tabs>
      <TabSlot />
      <TabList style={[styles.bar, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
        <TabTrigger name="overview" href="/" asChild><TabButton icon="overview" activeIcon="overviewFill" label="Overview" /></TabTrigger>
        <TabTrigger name="contracts" href="/contracts" asChild><TabButton icon="contracts" activeIcon="contractsFill" label="Agreements" /></TabTrigger>
        <TabTrigger name="ask" href="/ask" asChild><TabButton icon="ask" label="Ask" /></TabTrigger>
        <TabTrigger name="renewals" href="/renewals" asChild><TabButton icon="renewals" label="Renewals" badge={overdue} /></TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild><TabButton icon="slider" label="Settings" /></TabTrigger>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = TabTriggerSlotProps & { icon: IconName; activeIcon?: IconName; label: string; badge?: number };

function TabButton({ icon, activeIcon, label, badge, isFocused, onPress, ref, ...props }: TabButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = isFocused ? colors.accent : colors.muted;
  return (
    <Pressable
      {...props}
      // TabTrigger hands us its ref; the two libraries type it slightly differently.
      ref={ref as never}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      accessibilityLabel={badge ? `${label}, ${badge} overdue` : label}
      onPress={(event) => {
        if (Platform.OS !== "web" && !isFocused) void Haptics.selectionAsync();
        onPress?.(event);
      }}
      style={[styles.tab, isFocused && styles.tabOn]}
    >
      <View>
        <Icon name={isFocused && activeIcon ? activeIcon : icon} size={21} color={color} />
        {badge ? (
          <View style={styles.badge}><AppText style={styles.badgeText}>{badge > 9 ? "9+" : String(badge)}</AppText></View>
        ) : null}
      </View>
      <AppText style={[styles.label, { color }]} numberOfLines={1}>{label}</AppText>
    </Pressable>
  );
}

const useStyles = createStyles((c) => ({
  bar: {
    position: "absolute", left: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 2, padding: 6,
    borderRadius: 32, backgroundColor: c.tabBar, borderWidth: 1, borderColor: c.line,
    boxShadow: `0px 8px 28px ${c.shadow}`,
  },
  tab: { flex: 1, minWidth: 0, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 26 },
  tabOn: { backgroundColor: c.raised },
  label: { fontFamily: font.semibold, fontSize: 10.5, lineHeight: 13 },
  badge: { position: "absolute", top: -5, right: -10, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: c.danger, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: font.bold, fontSize: 10, lineHeight: 12, color: "#FFFFFF" },
}));
