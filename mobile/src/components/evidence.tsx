import { router } from "expo-router";
import { Pressable, View } from "react-native";
import type { QASource } from "@/lib/api/qa-stream";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { radius, space } from "@/theme/tokens";
import { AppText, Icon } from "./ui";

/** A source excerpt with its location: every material answer points back to one (PRODUCT.md principle 1). */
export function EvidenceCard({ source }: { source: QASource }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const opensContract = Boolean(source.contract_id);
  const body = (
    <View style={styles.card}>
      <View style={styles.head}>
        <Icon name="quote" size={14} color={colors.muted} />
        <AppText variant="smallStrong" style={styles.flex} numberOfLines={2}>{source.contract_title || source.label || "Source"}</AppText>
        {opensContract ? <Icon name="chevronRight" size={12} color={colors.faint} /> : null}
      </View>
      {source.location ? <AppText variant="caption" tone="faint">{source.location}</AppText> : null}
      <AppText variant="small" tone="muted" selectable>{source.excerpt}</AppText>
    </View>
  );
  if (!opensContract) return body;
  return (
    <Pressable accessibilityRole="link" accessibilityHint="Opens the contract" onPress={() => router.push({ pathname: "/contract/[id]", params: { id: source.contract_id!, tab: "ask" } })}>
      {body}
    </Pressable>
  );
}

export function EvidenceList({ sources, title = "Context used" }: { sources: QASource[]; title?: string }) {
  const styles = useStyles();
  if (!sources.length) return null;
  return (
    <View style={styles.list}>
      <AppText variant="eyebrow" tone="muted">{`${title} · ${sources.length} excerpt${sources.length === 1 ? "" : "s"}`}</AppText>
      {sources.map((source, index) => <EvidenceCard key={`${source.label ?? source.contract_id}-${source.location}-${index}`} source={source} />)}
    </View>
  );
}

/** A quoted clause inside a finding or record. */
export function SourceQuote({ location, text }: { location?: string; text: string }) {
  const styles = useStyles();
  return (
    <View style={styles.quote}>
      {location ? <AppText variant="caption" tone="faint">{location}</AppText> : null}
      <AppText variant="small" tone="muted" selectable>{text}</AppText>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  card: { gap: space.xs, padding: 14, borderRadius: radius.md, backgroundColor: c.raised },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  list: { gap: space.sm },
  quote: { gap: space.xs, padding: 14, borderRadius: radius.md, backgroundColor: c.raised },
}));
