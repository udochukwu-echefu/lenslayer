import { router } from "expo-router";
import { View } from "react-native";
import { asText, severity, titleCase } from "@/lib/format";
import type { RiskFinding, TaskCategory } from "@/lib/shared/types";
import { createStyles } from "@/theme/create-styles";
import { space } from "@/theme/tokens";
import { SourceQuote } from "../evidence";
import { AppText, Button, EmptyState, SeverityBadge } from "../ui";

/** Opens the action composer pre-filled from a finding or record, like the dashboard's "Create follow-up" links. */
function createAction(params: { contractId: string; category: TaskCategory; sourceKind: string; sourceIndex: number; title: string; description: string }) {
  router.push({ pathname: "/new/task", params: { ...params, sourceIndex: String(params.sourceIndex) } });
}

/**
 * One evidence-linked risk finding, top to bottom in the order a reviewer
 * thinks: how serious, what it is, why it matters, what to do, and the quoted
 * clause that proves it.
 */
export function Finding({ finding, index, contractId, canCreate, last }: { finding: RiskFinding; index: number; contractId: string; canCreate: boolean; last?: boolean }) {
  const styles = useStyles();
  const level = severity(finding.risk_level);
  const evidence = finding.evidence || finding.excerpt || finding.quote || finding.clause;
  const location = [finding.citation, finding.section, finding.page ? `Page ${finding.page}` : null, finding.location].filter(Boolean).join(" · ");
  return (
    <View style={[styles.item, !last && styles.divider]}>
      <SeverityBadge level={level} />
      <AppText variant="heading">{asText(finding.title, "Clause finding")}</AppText>
      {finding.explanation ? <Labelled label="Why it matters" text={finding.explanation} /> : null}
      {finding.recommendation ? <Labelled label="Suggested next step" text={finding.recommendation} /> : null}
      {evidence ? <SourceQuote location={location || undefined} text={`“${evidence}”`} /> : <AppText variant="small" tone="warning">No source excerpt was returned. Confirm this in the document.</AppText>}
      {finding.suggested_language ? <Labelled label="Suggested wording" text={finding.suggested_language} /> : null}
      {canCreate ? (
        <Button label="Create follow-up" icon="plus" variant="secondary" compact style={styles.action}
          onPress={() => createAction({ contractId, category: "risk", sourceKind: "finding", sourceIndex: index, title: asText(finding.title, "Review clause finding"), description: finding.recommendation || finding.explanation || "Confirm this finding against the agreement and decide the next step." })} />
      ) : null}
    </View>
  );
}

function Labelled({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ gap: space.xxs }}>
      <AppText variant="smallStrong" tone="muted">{label}</AppText>
      <AppText variant="body" selectable>{text}</AppText>
    </View>
  );
}

const recordLabel: Record<"obligation" | "payment" | "deadline" | "negotiation", string> = {
  obligation: "Obligation", payment: "Payment term", deadline: "Key date", negotiation: "Negotiation point",
};
const titleKeys = new Set(["title", "obligation", "deadline", "action", "priority", "issue", "item", "event"]);
const sourceKeys = new Set(["citation", "source", "section", "location", "page", "quote", "excerpt", "evidence"]);
const detailKeys = new Set(["description", "details", "context", "explanation"]);

function recordValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => asText(item, "")).filter(Boolean).join(", ") || "–";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return asText(value, "–");
}

/** Extracted obligations, payments, dates or negotiation points, each with its source. */
export function RecordCards({ items, empty, contractId, category, canCreate, taskCategory }: {
  items: Record<string, unknown>[]; empty: string; contractId: string; category: keyof typeof recordLabel; canCreate: boolean; taskCategory?: TaskCategory;
}) {
  const styles = useStyles();
  if (!items.length) return <EmptyState message={empty} />;
  const resolvedCategory: TaskCategory = taskCategory ?? (category === "payment" ? "obligation" : category);
  return (
    <View>
      {items.map((item, index) => {
        const title = asText(item.title ?? item.obligation ?? item.deadline ?? item.action ?? item.priority ?? item.issue ?? item.item ?? item.event, category === "deadline" ? "Contract deadline" : recordLabel[category]);
        const description = asText(item.description ?? item.details ?? item.context ?? item.explanation, "");
        const evidenceText = asText(item.quote ?? item.excerpt, "");
        const rawEvidence = asText(item.evidence, "");
        const source = [...new Set([item.citation, item.source, item.section, item.location, item.page ? `Page ${item.page}` : null, rawEvidence && rawEvidence.length < 120 ? rawEvidence : null]
          .map((value) => asText(value, "")).filter(Boolean))].join(" · ");
        const quote = evidenceText || (rawEvidence.length >= 120 ? rawEvidence : "");
        // Short facts (party, frequency, amount, date) fold into one muted line.
        const facts = Object.entries(item).filter(([key]) => !titleKeys.has(key) && !sourceKeys.has(key) && !detailKeys.has(key)).map(([, value]) => recordValue(value)).filter((value) => value !== "–" && value.length < 60);
        return (
          <View key={index} style={[styles.item, index < items.length - 1 && styles.divider]}>
            <AppText variant="bodyStrong">{title}</AppText>
            {facts.length ? <AppText variant="small" tone="muted">{facts.map((fact) => titleCase(fact)).join(" · ")}</AppText> : null}
            {description ? <AppText variant="small" selectable>{description}</AppText> : null}
            {quote ? <SourceQuote text={`“${quote}”`} location={source || undefined} /> : source ? <AppText variant="caption" tone="faint">{source}</AppText> : null}
            {canCreate ? (
              <Button label="Assign" variant="secondary" compact style={styles.action}
                onPress={() => createAction({ contractId, category: resolvedCategory, sourceKind: category, sourceIndex: index, title, description: description || `Verify this ${category} against the agreement, assign an owner, and record the next step.` })} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** A quiet label and one line of explanation at the top of a contract tab. */
export function SectionHeading({ title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="eyebrow" tone="muted" accessibilityRole="header">{title}</AppText>
      {description ? <AppText variant="small" tone="muted">{description}</AppText> : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  item: { gap: space.sm + 2, paddingVertical: space.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  action: { alignSelf: "flex-start", marginTop: space.xxs },
}));
