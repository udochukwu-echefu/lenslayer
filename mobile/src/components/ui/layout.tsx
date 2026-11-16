import { Pressable, RefreshControl, ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font, gutter, radius, section, space, tabBarClearance, touch } from "@/theme/tokens";
import { Icon, type IconName } from "./icon";
import { AppText } from "./text";

/**
 * Page scaffolding for the clean design: a white page, a 20pt gutter, sections
 * 28pt apart. Lists are plain rows split by hairlines (`ListRow`), never boxes.
 * `Card` is the one soft grey container, for the few things that need framing.
 */
export function Screen({ children, onRefresh, refreshing = false, contentStyle, ...props }: ScrollViewProps & { onRefresh?: () => void; refreshing?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
      contentContainerStyle={[styles.content, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.muted} /> : undefined}
      {...props}
    >
      {children}
    </ScrollView>
  );
}

/** One muted line under the large title, plus optional actions. */
export function PageIntro({ title, description, children }: { title?: string; description?: string; children?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.intro}>
      {title ? <AppText variant="display" accessibilityRole="header">{title}</AppText> : null}
      {description ? <AppText variant="small" tone="muted" style={styles.introText}>{description}</AppText> : null}
      {children ? <View style={styles.introActions}>{children}</View> : null}
    </View>
  );
}

export function Card({ children, style, tint }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  const styles = useStyles();
  return <View style={[styles.card, tint ? { backgroundColor: tint } : null, style]}>{children}</View>;
}

/** A quiet sentence-case label, an optional link on the right, then the content. */
export function Section({ title, description, action, children, style }: { title: string; description?: string; action?: { label: string; onPress: () => void }; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <View style={styles.flex}>
          <AppText variant="eyebrow" tone="muted" accessibilityRole="header">{title}</AppText>
          {description ? <AppText variant="caption" tone="faint">{description}</AppText> : null}
        </View>
        {action ? (
          <Pressable accessibilityRole="link" onPress={action.onPress} hitSlop={12}>
            <AppText variant="smallStrong" tone="accent">{action.label}</AppText>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return <AppText variant="eyebrow" tone="muted">{children}</AppText>;
}

/**
 * The list row: a title, at most one line of detail, an optional value on the
 * right and a chevron when it opens something. Icons are plain outlines with no
 * coloured tile behind them.
 */
export function ListRow({ title, subtitle, subtitleTone = "muted", value, meta, icon, iconColor, leading, onPress, trailing, last, destructive }: {
  title: string; subtitle?: string; subtitleTone?: "muted" | "danger" | "accent"; value?: string; /** Older name for `value`. */ meta?: string; icon?: IconName; iconColor?: string; leading?: React.ReactNode;
  onPress?: () => void; trailing?: React.ReactNode; last?: boolean; destructive?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const body = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      {leading}
      {icon ? <Icon name={icon} size={20} color={iconColor ?? (destructive ? colors.danger : colors.ink)} /> : null}
      <View style={styles.flex}>
        <AppText variant="bodyStrong" tone={destructive ? "danger" : "ink"} numberOfLines={2}>{title}</AppText>
        {subtitle ? <AppText variant="small" tone={subtitleTone} numberOfLines={2}>{subtitle}</AppText> : null}
      </View>
      {value ?? meta ? <AppText variant="small" tone="muted" numberOfLines={1} style={styles.rowValue}>{value ?? meta}</AppText> : null}
      {trailing}
      {onPress && !trailing ? <Icon name="chevronRight" size={13} color={colors.faint} /> : null}
    </View>
  );
  if (!onPress) return body;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>{body}</Pressable>;
}

export function Divider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}

/** Label on the left, value on the right, e.g. contract facts. Plain rows, no box. */
export function Facts({ items }: { items: [string, string][] }) {
  const styles = useStyles();
  return (
    <View>
      {items.map(([label, value], index) => (
        <View key={label} style={[styles.fact, index < items.length - 1 && styles.rowDivider]}>
          <AppText variant="small" tone="muted" style={styles.factLabel}>{label}</AppText>
          <AppText variant="smallStrong" style={styles.factValue} selectable>{value}</AppText>
        </View>
      ))}
    </View>
  );
}

/** A full-width soft grey box: label left, number right. Used for the Overview summary. */
export function SummaryBox({ label, value, tone = "ink", onPress }: { label: string; value: string | number; tone?: "ink" | "danger"; onPress?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.summary, pressed && { backgroundColor: colors.pressed }]}>
      <AppText variant="bodyStrong" style={styles.flex}>{label}</AppText>
      <AppText variant="number" tone={tone}>{String(value)}</AppText>
      {onPress ? <Icon name="chevronRight" size={13} color={colors.faint} /> : null}
    </Pressable>
  );
}

/** A small grey tile showing a day number over a short month or weekday. */
export function DateBlock({ date, urgent }: { date: Date; urgent?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.dateBlock} accessible accessibilityLabel={date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}>
      <AppText style={styles.dateDay} tone={urgent ? "danger" : "ink"}>{date.getDate()}</AppText>
      <AppText style={styles.dateMonth} tone={urgent ? "danger" : "muted"}>{date.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</AppText>
    </View>
  );
}

/** Initials in a soft circle. `tint` marks the signed-in person. */
export function Avatar({ name, size = 40, tint }: { name: string; size?: number; tint?: string }) {
  const { colors } = useTheme();
  const letters = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint ?? colors.raised, alignItems: "center", justifyContent: "center" }}>
      <AppText style={{ fontFamily: font.semibold, fontSize: Math.round(size * 0.36), color: tint ? colors.onCategory : colors.ink }}>{letters}</AppText>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: tabBarClearance + space.xl, gap: section },
  intro: { gap: space.xs },
  introText: { fontSize: 15, lineHeight: 22 },
  introActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md },
  card: { backgroundColor: c.raised, borderRadius: radius.lg, padding: 18, gap: space.md },
  section: { gap: space.xs },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 28 },
  flex: { flex: 1, gap: space.xxs },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 13, minHeight: 58 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.line },
  rowValue: { maxWidth: "45%" },
  pressed: { opacity: 0.6 },
  divider: { height: 1, backgroundColor: c.line },
  fact: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 13, minHeight: touch + 4 },
  factLabel: { width: 120 },
  factValue: { flex: 1, textAlign: "right" },
  summary: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 60, paddingLeft: 18, paddingRight: 14, borderRadius: radius.lg, backgroundColor: c.raised },
  dateBlock: { width: 46, height: 50, borderRadius: radius.md, backgroundColor: c.raised, alignItems: "center", justifyContent: "center" },
  dateDay: { fontFamily: font.bold, fontSize: 18, lineHeight: 22 },
  dateMonth: { fontFamily: font.semibold, fontSize: 10, lineHeight: 13, letterSpacing: 0.4 },
}));
