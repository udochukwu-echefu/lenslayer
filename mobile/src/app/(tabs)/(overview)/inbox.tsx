import { useState } from "react";
import { ContractList } from "@/components/contract-row";
import { LoadMore } from "@/components/load-more";
import { TaskList } from "@/components/task-row";
import { View } from "react-native";
import { Chips, EmptyState, ErrorState, Loading, Screen, Section } from "@/components/ui";
import { flatten, overviewWindow, useContractList, useOverview, useTaskList } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";

type Scope = "all" | "overdue" | "due_soon" | "decisions" | "processing" | "blocked";

function ContractQueue({ status, title, description, empty }: { status: string; title: string; description: string; empty?: string }) {
  const { organizationId } = useWorkspace();
  const query = useContractList(organizationId, { status }, status.includes("processing"));
  const { items, total } = flatten(query.data);
  return (
    <Section title={title} description={description}>
      <View>
        {query.isLoading ? <Loading rows={3} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> :
          !total && empty ? <EmptyState icon="inbox" message={empty} /> : (
            <>
              <ContractList contracts={items} />
              <LoadMore shown={items.length} total={total} noun="contracts" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
            </>
          )}
      </View>
    </Section>
  );
}

function TaskQueue({ overdue, dayStart, weekEnd, count }: { overdue?: boolean; dayStart: string; weekEnd: string; count: number }) {
  const { organizationId } = useWorkspace();
  const query = useTaskList(organizationId, { status: "open,in_progress", due_before: overdue ? dayStart : weekEnd, due_before_exclusive: true, due_after: overdue ? undefined : dayStart });
  const { items, total } = flatten(query.data);
  return (
    <Section title={overdue ? "Overdue actions" : "Due in the next 7 days"} description={overdue ? `${count} need a human update` : `${count} due soon`}>
      <View>
        {query.isLoading ? <Loading rows={3} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : (
          <>
            <TaskList tasks={items} />
            <LoadMore shown={items.length} total={total} noun="actions" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
          </>
        )}
      </View>
    </Section>
  );
}

/** Port of the dashboard Inbox: everything that needs attention, filterable. */
export default function InboxScreen() {
  const [window] = useState(() => overviewWindow());
  const [scope, setScope] = useState<Scope>("all");
  const { organizationId } = useWorkspace();
  const overview = useOverview(organizationId);
  const counts = overview.data?.counts;
  const overdue = counts?.overdue_tasks ?? 0, dueSoon = counts?.due_soon_tasks ?? 0;
  const ready = counts?.ready ?? 0, moving = counts?.processing ?? 0, blocked = counts?.failed ?? 0;
  const total = overdue + dueSoon + ready + moving + blocked;
  const show = (value: Scope) => scope === "all" || scope === value;

  return (
    <Screen onRefresh={() => void overview.refetch()} refreshing={overview.isRefetching}>
      <Chips label="Inbox filters" value={scope} onChange={setScope} options={[
        { value: "all", label: "All", count: counts ? total : undefined },
        { value: "overdue", label: "Overdue", count: counts ? overdue : undefined },
        { value: "due_soon", label: "Due soon", count: counts ? dueSoon : undefined },
        { value: "decisions", label: "Decisions", count: counts ? ready : undefined },
        { value: "processing", label: "Reviewing", count: counts ? moving : undefined },
        { value: "blocked", label: "Blocked", count: counts ? blocked : undefined },
      ]} />
      {overview.isLoading ? <Loading rows={7} /> : overview.error ? <ErrorState error={overview.error} onRetry={() => void overview.refetch()} /> : !total ? (
        <EmptyState title="You’re all caught up" message="Reviews, overdue actions and processing problems will appear here." />
      ) : (
        <>
          {show("overdue") && overdue > 0 ? <TaskQueue key={`${organizationId}-overdue`} overdue dayStart={window.day_start} weekEnd={window.week_end} count={overdue} /> : null}
          {show("due_soon") && dueSoon > 0 ? <TaskQueue key={`${organizationId}-soon`} dayStart={window.day_start} weekEnd={window.week_end} count={dueSoon} /> : null}
          {show("decisions") ? <ContractQueue key={`${organizationId}-ready`} status="ready" title="Ready for a decision" description={`${ready} ${ready === 1 ? "contract" : "contracts"}`} empty="No contract decisions are waiting" /> : null}
          {show("processing") ? <ContractQueue key={`${organizationId}-processing`} status="queued,processing,running" title="Reviewing" description={`${moving} active, updates automatically`} empty="No active processing jobs" /> : null}
          {show("blocked") && blocked > 0 ? <ContractQueue key={`${organizationId}-failed`} status="failed" title="Blocked" description={`${blocked} ${blocked === 1 ? "contract" : "contracts"}`} /> : null}
          {scope !== "all" && ((scope === "overdue" && !overdue) || (scope === "due_soon" && !dueSoon) || (scope === "blocked" && !blocked)) ? <EmptyState icon="inbox" message="No items match this inbox filter" /> : null}
        </>
      )}
    </Screen>
  );
}
