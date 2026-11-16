import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { api } from "@/lib/api";
import { formatDate, formatRelativeDate, titleCase } from "@/lib/format";
import type { NegotiationItem, NegotiationItemStatus } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { radius, space } from "@/theme/tokens";
import { AppText, Button, EmptyState, ErrorState, FormError, ListRow, Loading, Section, StatusBadge } from "../ui";

/**
 * Negotiation for one contract: the latest version received, the checklist of
 * points with each side's position, and what the counterparty has said.
 */
export function ContractNegotiate({ contractId }: { contractId: string }) {
  const styles = useStyles();
  const { organizationId, canUpload } = useWorkspace();
  const queryClient = useQueryClient();
  const enabled = Boolean(organizationId);
  const items = useQuery({ queryKey: ["negotiation-items", organizationId, contractId], queryFn: () => api.negotiationItems(organizationId, contractId), enabled });
  const versions = useQuery({ queryKey: ["versions", organizationId, contractId], queryFn: () => api.versions(organizationId, contractId), enabled });
  const responses = useQuery({ queryKey: ["counterparty-responses", organizationId, contractId], queryFn: () => api.counterpartyResponses(organizationId, contractId), enabled });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: NegotiationItemStatus }) => api.updateNegotiationItem(organizationId, contractId, id, { status }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ["negotiation-items", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["deal-passport", organizationId, contractId] })]),
  });
  const points = items.data ?? [];
  const count = (status: NegotiationItemStatus[]) => points.filter((point) => status.includes(point.status)).length;
  const latest = [...(versions.data ?? [])].sort((a, b) => b.version_number - a.version_number);
  const params = { contractId };

  return (
    <View style={{ gap: space.xl }}>
      <Section title="Versions" action={canUpload ? { label: "Upload revision", onPress: () => router.push({ pathname: "/new/version", params }) } : undefined}>
        {versions.isLoading ? <Loading rows={2} /> : latest.length ? (
          <View>
            {latest.map((version, index) => (
              <ListRow key={version.id} icon="layers" title={`Version ${version.version_number}${version.label ? ` · ${version.label}` : ""}`}
                subtitle={version.comparison.compared_to_version_id ? `${version.comparison.added_count} added · ${version.comparison.removed_count} removed · ${formatDate(version.created_at, { day: "numeric", month: "short" })}` : `Original · ${formatDate(version.created_at, { day: "numeric", month: "short" })}`}
                last={index === latest.length - 1} />
            ))}
            {latest[0]?.comparison.changed_summary ? <AppText variant="small" tone="muted" style={styles.summary}>{latest[0].comparison.changed_summary}</AppText> : null}
          </View>
        ) : <AppText variant="small" tone="muted">Only the original has been uploaded.</AppText>}
      </Section>

      <Section title={`Checklist · ${points.length} ${points.length === 1 ? "point" : "points"}`} description={points.length ? `${count(["accepted", "resolved"])} accepted · ${count(["rejected"])} rejected · ${count(["proposed", "unresolved"])} open` : undefined}
        action={canUpload ? { label: "Add point", onPress: () => router.push({ pathname: "/new/negotiation-item", params }) } : undefined}>
        {items.isLoading ? <Loading rows={3} /> : items.error ? <ErrorState error={items.error} onRetry={() => void items.refetch()} /> : points.length ? (
          <View>
            {points.map((point, index) => <Point key={point.id} point={point} canEdit={canUpload} busy={update.isPending} last={index === points.length - 1} onStatus={(status) => update.mutate({ id: point.id, status })} />)}
          </View>
        ) : <EmptyState icon="chat" message="No negotiation points yet. Add the changes you want and track where each one lands." />}
        <FormError error={update.error} />
      </Section>

      <Section title="Counterparty responses">
        {(responses.data ?? []).length ? (
          <View>
            {(responses.data ?? []).map((response, index, all) => (
              <ListRow key={response.id} title={response.responder_name || "Counterparty"} subtitle={response.body} value={formatRelativeDate(response.created_at)} last={index === all.length - 1} />
            ))}
          </View>
        ) : <AppText variant="small" tone="muted">Nothing logged yet.</AppText>}
      </Section>
      {canUpload ? <Button label="Log a counterparty response" variant="secondary" onPress={() => router.push({ pathname: "/new/response", params })} /> : null}
    </View>
  );
}

function Point({ point, canEdit, busy, last, onStatus }: { point: NegotiationItem; canEdit: boolean; busy: boolean; last: boolean; onStatus: (status: NegotiationItemStatus) => void }) {
  const styles = useStyles();
  const open = point.status === "proposed" || point.status === "unresolved";
  return (
    <View style={[styles.point, !last && styles.divider]}>
      <View style={styles.head}>
        <AppText variant="bodyStrong" style={styles.flex}>{point.title}</AppText>
        <StatusBadge status={point.status} label={open ? "Open" : titleCase(point.status)} />
      </View>
      {point.our_position || point.counterparty_position ? (
        <View style={styles.sides}>
          <View style={styles.side}><AppText variant="caption" tone="faint">We want</AppText><AppText variant="small">{point.our_position || "–"}</AppText></View>
          <View style={styles.side}><AppText variant="caption" tone="faint">They offer</AppText><AppText variant="small">{point.counterparty_position || "–"}</AppText></View>
        </View>
      ) : point.description ? <AppText variant="small" tone="muted">{point.description}</AppText> : null}
      {open && canEdit ? (
        <View style={styles.actions}>
          <Button label="Accept" variant="secondary" compact disabled={busy} onPress={() => onStatus("accepted")} />
          <Button label="Reject" variant="secondary" compact disabled={busy} onPress={() => onStatus("rejected")} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  summary: { marginTop: space.sm },
  point: { gap: space.sm + 2, paddingVertical: space.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  flex: { flex: 1 },
  sides: { flexDirection: "row", gap: space.sm },
  side: { flex: 1, gap: space.xxs, padding: space.md, borderRadius: radius.md, backgroundColor: c.raised },
  actions: { flexDirection: "row", gap: space.sm },
}));
