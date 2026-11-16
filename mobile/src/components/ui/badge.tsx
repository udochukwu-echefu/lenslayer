import { View } from "react-native";
import { titleCase } from "@/lib/format";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import type { ColorTokens } from "@/theme/tokens";
import { font, space } from "@/theme/tokens";
import { AppText } from "./text";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneColor = (c: ColorTokens, tone: BadgeTone) =>
  ({ neutral: c.muted, success: c.good, warning: c.warning, danger: c.danger, info: c.info })[tone];

/** Same mapping as dashboard/src/components/ui/status-badge.tsx: state is always a word, never colour alone. */
const statusConfig: Record<string, { tone: BadgeTone; label?: string }> = {
  ready: { tone: "info", label: "Ready for decision" },
  reviewed: { tone: "success" },
  completed: { tone: "success" },
  done: { tone: "success" },
  approved: { tone: "success" },
  conditionally_approved: { tone: "success", label: "Approved with conditions" },
  succeeded: { tone: "success" },
  active: { tone: "info" },
  accepted: { tone: "success" },
  resolved: { tone: "success" },
  cancelled: { tone: "neutral" },
  revoked: { tone: "neutral" },
  expired: { tone: "neutral" },
  processing: { tone: "warning", label: "Reviewing" },
  running: { tone: "warning", label: "Reviewing" },
  queued: { tone: "neutral" },
  pending: { tone: "warning" },
  proposed: { tone: "warning" },
  unresolved: { tone: "warning" },
  changes_requested: { tone: "warning", label: "Changes requested" },
  failed: { tone: "danger" },
  rejected: { tone: "danger" },
  blocked: { tone: "danger" },
  escalated: { tone: "danger" },
  open: { tone: "info" },
  in_progress: { tone: "warning", label: "In progress" },
};

/**
 * Status as a small dot and a coloured word. The clean pass dropped filled
 * pills: a screen of them all shouted at once.
 */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = toneColor(colors, tone);
  return (
    <View style={styles.badge}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText style={[styles.label, { color }]} numberOfLines={1}>{label}</AppText>
    </View>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const config = statusConfig[status.toLowerCase()] ?? { tone: "neutral" as const };
  return <Badge tone={config.tone} label={label ?? config.label ?? titleCase(status)} />;
}

/** Risk severity: separate from confidence and from evidence status (PRODUCT.md principle 7). */
export function SeverityBadge({ level }: { level: "high" | "medium" | "low" }) {
  const tone: BadgeTone = level === "high" ? "danger" : level === "medium" ? "warning" : "success";
  return <Badge tone={tone} label={`${titleCase(level)} risk`} />;
}

const useStyles = createStyles(() => ({
  badge: { flexDirection: "row", alignItems: "center", gap: space.xs + 2, alignSelf: "flex-start", flexShrink: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
}));
