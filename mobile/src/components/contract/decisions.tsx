import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { formatDate, formatRelativeDate, titleCase } from "@/lib/format";
import type { ApprovalRequest, ApprovalStatus } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { space } from "@/theme/tokens";
import { AppText, Button, Card, CheckRow, ErrorState, FormError, ListRow, Loading, Section, Sheet, StatusBadge, TextField } from "../ui";

/**
 * Approvals waiting on someone, and the log of decisions people have recorded.
 * LensLayer never decides: every entry carries a name, a reason and a time.
 */
export function ContractDecisions({ contractId }: { contractId: string }) {
  const { organizationId, canUpload, user } = useWorkspace();
  const enabled = Boolean(organizationId);
  const approvals = useQuery({ queryKey: ["approvals", organizationId, contractId], queryFn: () => api.approvals(organizationId, contractId), enabled });
  const decisions = useQuery({ queryKey: ["decisions", organizationId, contractId], queryFn: () => api.decisions(organizationId, contractId), enabled });
  const [deciding, setDeciding] = useState<ApprovalRequest | null>(null);
  const pending = (approvals.data ?? []).filter((approval) => approval.status === "pending");
  const settled = (approvals.data ?? []).filter((approval) => approval.status !== "pending");
  const params = { contractId };

  return (
    <View style={{ gap: space.xl }}>
      {approvals.isLoading ? <Loading rows={2} /> : approvals.error ? <ErrorState error={approvals.error} onRetry={() => void approvals.refetch()} /> : pending.map((approval) => {
        const mine = !approval.assigned_to_user_id || approval.assigned_to_user_id === user?.id;
        return (
          <Card key={approval.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
              <AppText variant="smallStrong" tone="accent">{mine ? "Waiting on you" : `Waiting on ${approval.assigned_to_name ?? "an approver"}`}</AppText>
              {approval.due_at ? <AppText variant="caption" tone="faint">{`Due ${formatDate(approval.due_at, { day: "numeric", month: "short" })}`}</AppText> : null}
            </View>
            <AppText variant="heading">{approval.title}</AppText>
            <AppText variant="small" tone="muted">{`Requested by ${approval.requested_by_name}${approval.conditions.length ? ` · ${approval.conditions.length} ${approval.conditions.length === 1 ? "condition" : "conditions"} to check` : ""}`}</AppText>
            {canUpload && mine ? <Button label="Review and decide" onPress={() => setDeciding(approval)} /> : null}
          </Card>
        );
      })}

      <Section title="Decision log">
        {decisions.isLoading ? <Loading rows={3} /> : decisions.error ? <ErrorState error={decisions.error} onRetry={() => void decisions.refetch()} /> : (decisions.data ?? []).length || settled.length ? (
          <View>
            {settled.map((approval) => (
              <ListRow key={approval.id} title={approval.title} subtitle={`${approval.resolved_by_name ?? "Approver"} · ${formatRelativeDate(approval.resolved_at)}${approval.resolution_note ? ` · ${approval.resolution_note}` : ""}`} trailing={<StatusBadge status={approval.status} />} />
            ))}
            {(decisions.data ?? []).map((decision, index, all) => (
              <ListRow key={decision.id} title={`${titleCase(decision.decision)} · ${decision.subject}`} subtitle={`${decision.rationale} · ${decision.reviewer_name}, ${formatRelativeDate(decision.created_at)}`} last={index === all.length - 1} />
            ))}
          </View>
        ) : <AppText variant="small" tone="muted">No decisions recorded yet.</AppText>}
      </Section>

      {canUpload ? (
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button label="Record decision" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/new/decision", params })} />
          <Button label="Request approval" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/new/approval", params })} />
        </View>
      ) : null}
      <ApprovalSheet contractId={contractId} approval={deciding} onClose={() => setDeciding(null)} />
    </View>
  );
}

/** Check each condition, give a reason, then approve, approve with conditions, ask for changes, or reject. */
function ApprovalSheet({ contractId, approval, onClose }: { contractId: string; approval: ApprovalRequest | null; onClose: () => void }) {
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: (status: Exclude<ApprovalStatus, "pending">) => api.decideApproval(organizationId, contractId, approval!.id, { status, resolution_note: note.trim(), condition_results: Object.fromEntries(approval!.conditions.map((condition) => [condition, Boolean(checks[condition])])) }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["approvals", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["deal-passport", organizationId, contractId] }), queryClient.invalidateQueries({ queryKey: ["overview", organizationId] })]);
      setChecks({}); setNote(""); onClose();
    },
  });
  if (!approval) return null;
  const met = approval.conditions.filter((condition) => checks[condition]).length;
  const allMet = met === approval.conditions.length;
  const hasReason = note.trim().length >= 5;
  return (
    <Sheet title={approval.title} visible onClose={onClose} action={{ label: "Close", onPress: onClose }}>
      {approval.note ? <AppText variant="small" tone="muted">{approval.note}</AppText> : null}
      {approval.conditions.length ? (
        <View>
          <AppText variant="eyebrow" tone="muted">{`Conditions · ${met} of ${approval.conditions.length} met`}</AppText>
          {approval.conditions.map((condition) => <CheckRow key={condition} label={condition} checked={Boolean(checks[condition])} onChange={(checked) => setChecks({ ...checks, [condition]: checked })} />)}
        </View>
      ) : null}
      <TextField label="Reason" value={note} onChangeText={setNote} multiline placeholder="Why you’re deciding this way" help="At least 5 characters. Saved with your name and the time." maxLength={2000} />
      <FormError error={decide.error} />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Button label="Reject" variant="danger" style={{ flex: 1 }} disabled={!hasReason || decide.isPending} onPress={() => decide.mutate("rejected")} />
        <Button label={allMet ? "Approve" : "Approve with conditions"} icon="check" style={{ flex: 1.4 }} disabled={!hasReason} loading={decide.isPending} onPress={() => decide.mutate(allMet ? "approved" : "conditionally_approved")} />
      </View>
      <Button label="Ask for changes instead" variant="ghost" disabled={!hasReason || decide.isPending} onPress={() => decide.mutate("changes_requested")} />
    </Sheet>
  );
}
