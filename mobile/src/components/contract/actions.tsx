import { router } from "expo-router";
import { View } from "react-native";
import { flatten, useTaskList } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { space } from "@/theme/tokens";
import { LoadMore } from "../load-more";
import { TaskList } from "../task-row";
import { AppText, Button, ErrorState, Loading, Notice } from "../ui";

/** Human follow-through for one contract. Findings stay evidence; only people create work. */
export function ContractActions({ contractId }: { contractId: string }) {
  const { organizationId, canUpload } = useWorkspace();
  const query = useTaskList(organizationId, { contract_id: contractId });
  const { items, total } = flatten(query.data);
  return (
    <View style={{ gap: space.lg }}>
      <AppText variant="small" tone="muted">Findings stay evidence. People decide what becomes work.</AppText>
      {!canUpload ? <Notice title="You can view, not edit" message="Ask an owner or admin if you need to assign or complete actions." icon="eye" /> : null}
      {query.isLoading ? <Loading rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : (
        <View>
          <TaskList tasks={items} empty="No actions have been created for this contract." />
          <LoadMore shown={items.length} total={total} noun="actions" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
        </View>
      )}
      {canUpload ? <Button label="Create an action" icon="plus" variant="secondary" onPress={() => router.push({ pathname: "/new/task", params: { contractId } })} /> : null}
    </View>
  );
}
