import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { api } from "@/lib/api";
import { contractActivityDetail, formatRelativeDate, titleCase } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace";
import { space } from "@/theme/tokens";
import { AppText, Button, Card, confirm, ErrorState, FormError, ListRow, Loading } from "../ui";

/** The audit history for one contract and, for owners and admins, permanent deletion. */
export function ContractActivity({ contractId }: { contractId: string }) {
  const { organizationId, canDelete } = useWorkspace();
  const queryClient = useQueryClient();
  const activity = useQuery({ queryKey: ["contract-activity", organizationId, contractId], queryFn: () => api.contractActivity(organizationId, contractId), enabled: Boolean(organizationId) });
  const remove = useMutation({
    mutationFn: () => api.deleteContract(organizationId, contractId),
    onSuccess: async () => {
      await Promise.all(["contracts", "tasks", "lifecycle", "overview", "workspace-search", "calendar-grid"].map((root) => queryClient.invalidateQueries({ queryKey: [root, organizationId] })));
      router.back();
    },
  });
  const events = activity.data ?? [];

  return (
    <View style={{ gap: space.xl }}>
      {activity.isLoading ? <Loading rows={5} /> : activity.error ? <ErrorState error={activity.error} onRetry={() => void activity.refetch()} /> : events.length ? (
        <View>
          {events.map((event, index) => (
            <ListRow key={event.id} title={titleCase(event.action.replaceAll(".", " "))}
              subtitle={[event.actor_name || "System", formatRelativeDate(event.created_at), contractActivityDetail(event)].filter(Boolean).join(" · ")} last={index === events.length - 1} />
          ))}
        </View>
      ) : <AppText variant="small" tone="muted">No activity recorded yet.</AppText>}

      {canDelete ? (
        <Card>
          <AppText variant="bodyStrong" tone="danger">Delete this contract</AppText>
          <AppText variant="small" tone="muted">Removes the review, versions, discussion and retained files for everyone in the workspace. This can’t be undone.</AppText>
          <Button label="Delete permanently…" variant="danger" loading={remove.isPending}
            onPress={async () => { if (await confirm("Delete this contract?", "The review record and retained source material are removed permanently. This cannot be undone.", "Delete")) remove.mutate(); }} />
          <FormError error={remove.error} />
          <AppText variant="caption" tone="faint">Owners and admins only.</AppText>
        </Card>
      ) : null}
    </View>
  );
}
