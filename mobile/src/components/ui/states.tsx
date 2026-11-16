import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { radius, space } from "@/theme/tokens";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { AppText } from "./text";

/** Skeleton rows that approximate the destination layout. The pulse stops under Reduce Motion. */
export function Loading({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  const styles = useStyles();
  // useState (not useRef) so the value is created once and is safe to read while rendering.
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 650, useNativeDriver: true }),
      ]));
      loop.start();
    });
    return () => loop?.stop();
  }, [pulse]);
  return (
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={styles.stack}>
      {Array.from({ length: rows }, (_, index) => (
        <Animated.View key={index} style={[styles.skeletonRow, { opacity: pulse }]}>
          <View style={[styles.skeleton, { width: index % 3 === 2 ? "55%" : "78%" }]} />
          <View style={[styles.skeleton, styles.skeletonSmall, { width: index % 2 ? "40%" : "52%" }]} />
        </Animated.View>
      ))}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <View style={styles.panel} accessibilityRole="alert">
      <Icon name="alert" size={18} color={colors.danger} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">We couldn’t load this</AppText>
        <AppText variant="small" tone="muted">{message}</AppText>
        {onRetry ? <Button label="Try again" variant="secondary" compact onPress={onRetry} style={styles.retry} /> : null}
      </View>
    </View>
  );
}

/** A centred icon, one useful sentence and, at most, one action the current role can perform. */
export function EmptyState({ title, message, icon = "check", action }: { title?: string; message: string; icon?: IconName; action?: { label: string; onPress: () => void } }) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon name={icon} size={22} /></View>
      {title ? <AppText variant="heading" style={styles.center}>{title}</AppText> : null}
      <AppText variant="small" tone="muted" style={styles.center}>{message}</AppText>
      {action ? <Button label={action.label} variant="secondary" compact onPress={action.onPress} style={styles.emptyAction} /> : null}
    </View>
  );
}

/** A quiet grey block. Only the icon carries the tone's colour. */
export function Notice({ title, message, tone = "info", icon = "help", children }: { title: string; message?: string; tone?: "info" | "warning" | "danger"; icon?: IconName; children?: React.ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.ink;
  return (
    <View style={styles.panel}>
      <Icon name={icon} size={18} color={color} />
      <View style={styles.flex}>
        <AppText variant="smallStrong">{title}</AppText>
        {message ? <AppText variant="small" tone="muted">{message}</AppText> : null}
        {children}
      </View>
    </View>
  );
}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <AppText variant="small" tone="danger" accessibilityRole="alert">{error instanceof Error ? error.message : String(error)}</AppText>;
}

const useStyles = createStyles((c) => ({
  stack: { gap: space.xs },
  skeletonRow: { gap: space.sm, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.line },
  skeleton: { height: 16, borderRadius: radius.sm, backgroundColor: c.well },
  skeletonSmall: { height: 12 },
  panel: { flexDirection: "row", gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: c.raised },
  flex: { flex: 1, gap: space.xs },
  retry: { alignSelf: "flex-start", marginTop: space.sm },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: c.raised, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  emptyAction: { marginTop: space.sm },
  center: { textAlign: "center" },
}));
