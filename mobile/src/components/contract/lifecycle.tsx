import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { daysUntil, reminderLabel, titleCase } from "@/lib/format";
import { flatten, invalidateWorkspaceRecords, useLifecycleList } from "@/lib/queries";
import type { LifecycleItem } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { space } from "@/theme/tokens";
import { LoadMore } from "../load-more";
import { AppText, Button, DateBlock, EmptyState, ErrorState, FormError, Loading } from "../ui";

/** One date: when, what, who. "Done" closes it; an overdue open date is shown in red. */
export function LifecycleRow({ item, canEdit, last }: { item: LifecycleItem; canEdit: boolean; last?: boolean }) {
  const styles = useStyles();
  const { organizationId } = useWorkspace();
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (status: "completed" | "cancelled") => api.updateLifecycle(organizationId, item.id, { status }),
    onSuccess: () => invalidateWorkspaceRecords(queryClient, organizationId, "lifecycle"),
  });
  const days = daysUntil(item.due_at);
  const active = item.status === "active";
  const detail = [titleCase(item.kind), item.amount || null, `reminder ${reminderLabel(item.reminder_days).toLowerCase()}`, item.recurrence !== "none" ? `repeats ${item.recurrence}` : null, item.owner_name || "Unassigned"].filter(Boolean).join(" · ");
  return (
    <View style={[styles.row, !last && styles.divider, !active && styles.closed]}>
      <DateBlock date={new Date(item.due_at)} urgent={active && days <= 14} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={2}>{item.title}</AppText>
        <AppText variant="small" tone="muted">{active ? detail : `${titleCase(item.status)} · ${detail}`}</AppText>
        <FormError error={update.error} />
      </View>
      {active && canEdit ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${item.title} done`} hitSlop={10} disabled={update.isPending} onPress={() => update.mutate("completed")}>
          <AppText variant="smallStrong" tone="accent">Done</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Renewals, notice windows, obligations, payments and recurring follow-through for one contract. */
export function ContractLifecycle({ contractId }: { contractId: string }) {
  const { organizationId, canUpload } = useWorkspace();
  const query = useLifecycleList(organizationId, { contract_id: contractId, sort: "due_at" });
  const { items, total } = flatten(query.data);
  return (
    <View style={{ gap: space.lg }}>
      <AppText variant="small" tone="muted">Renewals, notice windows, payments and recurring obligations after signing.</AppText>
      {query.isLoading ? <Loading rows={5} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : items.length ? (
        <View>
          {items.map((item, index) => <LifecycleRow key={item.id} item={item} canEdit={canUpload} last={index === items.length - 1} />)}
          <LoadMore shown={items.length} total={total} noun="dates" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
        </View>
      ) : <EmptyState icon="renewals" title="No dates yet" message="Add the first date once someone has checked it against the agreement." />}
      {canUpload ? <Button label="Add a date" icon="plus" variant="secondary" onPress={() => router.push({ pathname: "/new/lifecycle", params: { contractId } })} /> : null}
    </View>
  );
}

const useStyles = createStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  closed: { opacity: 0.55 },
  flex: { flex: 1, gap: space.xxs },
}));
