import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { api } from "@/lib/api";
import { asText, formatDate, severity, titleCase } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";
import { space } from "@/theme/tokens";
import { AppText, DateBlock, ErrorState, ListRow, Loading, Notice, Section, SeverityBadge } from "../ui";

/**
 * The Deal Passport: a compact decision record of what is agreed, what is
 * open, and what must happen next. Read top to bottom before signing.
 */
export function DealPassport({ contractId, onOpenTab }: { contractId: string; onOpenTab?: (tab: string) => void }) {
  const { organizationId } = useWorkspace();
  const query = useQuery({ queryKey: ["deal-passport", organizationId, contractId], queryFn: () => api.dealPassport(organizationId, contractId), enabled: Boolean(organizationId) });
  if (query.isLoading) return <Loading rows={7} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const item = query.data;
  if (!item) return null;
  const ready = item.readiness === "ready";
  const negotiation = item.negotiation;
  return (
    <View style={{ gap: space.xl }}>
      <Notice
        tone={ready ? "info" : item.readiness === "blocked" ? "danger" : "warning"}
        icon={ready ? "checkCircle" : "alert"}
        title={ready ? "Ready to sign" : item.readiness === "blocked" ? "Blocked" : "Needs attention"}
        message={item.readiness_reasons.length ? item.readiness_reasons.join(" · ") : "Signing readiness"}
      />

      <Section title="Top risks" action={onOpenTab ? { label: `All ${item.top_risks.length}`, onPress: () => onOpenTab("risks") } : undefined}>
        {item.top_risks.length ? (
          <View>
            {item.top_risks.slice(0, 4).map((risk, index, all) => (
              <ListRow key={index} title={asText(risk.title, "Clause finding")} subtitle={asText(risk.citation ?? risk.section ?? risk.location, "Confirm in the source document")}
                trailing={<SeverityBadge level={severity(risk.risk_level)} />} last={index === all.length - 1} />
            ))}
          </View>
        ) : <AppText variant="small" tone="muted">No risk findings were returned.</AppText>}
      </Section>

      <Section title="Negotiation">
        <ListRow title={`${negotiation.accepted_changes.length} accepted · ${negotiation.rejected_changes.length} rejected · ${negotiation.unresolved_points.length} open`}
          subtitle={negotiation.final_summary || undefined} onPress={onOpenTab ? () => onOpenTab("negotiate") : undefined} last />
      </Section>

      {item.approvals.length || item.open_actions.length ? (
        <Section title="Approvals and actions">
          <View>
            {item.approvals.map((approval) => <ListRow key={approval.id} title={approval.title} subtitle={`${titleCase(approval.status)}${approval.assigned_to ? ` · ${approval.assigned_to}` : ""}`} />)}
            {item.open_actions.map((action, index) => <ListRow key={action.id} title={action.title} subtitle={`${titleCase(action.status)}${action.owner ? ` · ${action.owner}` : ""}`} last={index === item.open_actions.length - 1} />)}
          </View>
        </Section>
      ) : null}

      <Section title="Key dates">
        {item.key_dates.length ? (
          <View>
            {item.key_dates.map((date, index) => (
              <ListRow key={date.id} leading={<DateBlock date={new Date(date.due_at)} />} title={date.title} subtitle={date.owner || "Unassigned"} value={formatDate(date.due_at, { year: "numeric" })} last={index === item.key_dates.length - 1} />
            ))}
          </View>
        ) : <AppText variant="small" tone="muted">No active dates recorded.</AppText>}
      </Section>
    </View>
  );
}
