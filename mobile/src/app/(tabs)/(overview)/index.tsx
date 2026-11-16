import { router, Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { HeaderButton } from "@/components/header";
import { AppText, EmptyState, ErrorState, ListRow, Loading, Screen, Section, SummaryBox } from "@/components/ui";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { daysUntil, formatDate, formatRelativeDate } from "@/lib/format";
import { useNotifications, useOverview } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { space } from "@/theme/tokens";

type Item = { key: string; title: string; detail: string; late?: boolean; open: () => void };

/**
 * "Today": the one screen that answers "what needs me?". Three numbers that
 * each open a list, then a single mixed list of the next human steps:
 * overdue actions first, then reviews waiting for a decision, then the
 * nearest renewal and notice dates.
 */
export default function OverviewScreen() {
  const { organizationId, canUpload } = useWorkspace();
  const query = useOverview(organizationId);
  const notifications = useNotifications(organizationId);
  const unread = (notifications.data ?? []).filter((item) => !item.read_at).length;
  const data = query.data;
  const counts = data?.counts;

  // Read the clock once per visit: rendering must give the same result if React runs it twice.
  const [now] = useState(() => Date.now());
  const nextDate = (data?.upcoming_lifecycle ?? []).filter((item) => item.status === "active").sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
  const nextIn = nextDate ? daysUntil(nextDate.due_at, now) : null;

  const items: Item[] = [];
  for (const task of data?.my_tasks ?? []) {
    if (!task.due_at || task.status === "done" || task.status === "cancelled") continue;
    const days = daysUntil(task.due_at, now);
    if (days >= 0) continue;
    items.push({ key: `task-${task.id}`, title: task.title, detail: `${-days} ${days === -1 ? "day" : "days"} late`, late: true, open: () => router.push("/renewals/tasks") });
  }
  for (const contract of data?.attention_contracts ?? []) {
    const failed = contract.status === "failed";
    items.push({
      key: `contract-${contract.id}`,
      title: failed ? `Fix ${contract.title || contract.source_name}` : `Review ${contract.title || contract.source_name}`,
      detail: failed ? "Couldn’t be read" : `Ready ${formatRelativeDate(contract.updated_at)}`,
      late: failed,
      open: () => router.push({ pathname: "/contract/[id]", params: { id: contract.id } }),
    });
  }
  for (const date of (data?.upcoming_lifecycle ?? []).slice(0, 2)) {
    const days = daysUntil(date.due_at, now);
    items.push({
      key: `date-${date.id}`,
      title: date.title,
      detail: `${formatDate(date.due_at, { day: "numeric", month: "long" })} · ${days <= 0 ? "due today" : `${days} ${days === 1 ? "day" : "days"} left`}`,
      open: () => router.push("/renewals"),
    });
  }
  const shown = items.slice(0, 5);

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Stack.Screen options={{
        headerLeft: () => <WorkspaceSwitcher />,
        headerRight: () => (
          <View style={{ flexDirection: "row" }}>
            <HeaderButton icon="search" label="Search" onPress={() => router.push("/search")} />
            <HeaderButton icon="bell" label={`${unread || "No"} unread notifications`} badge={unread} onPress={() => router.push("/notifications")} />
          </View>
        ),
      }} />
      <AppText tone="muted" style={{ marginTop: -space.sm, fontSize: 15 }}>{formatDate(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long" })}</AppText>

      {query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : (
        <View style={{ gap: space.sm }}>
          <SummaryBox label="To decide" value={counts?.ready ?? "–"} onPress={() => router.push("/inbox")} />
          <SummaryBox label="Overdue" value={counts?.overdue_tasks ?? "–"} tone={counts?.overdue_tasks ? "danger" : "ink"} onPress={() => router.push("/renewals/tasks")} />
          <SummaryBox label="Next notice" value={nextIn === null ? "None" : nextIn <= 0 ? "Today" : `${nextIn} ${nextIn === 1 ? "day" : "days"}`} onPress={() => router.push("/renewals")} />
        </View>
      )}

      <Section title="Needs you" action={shown.length ? { label: "See all", onPress: () => router.push("/inbox") } : undefined}>
        {query.isLoading ? <Loading rows={4} /> : shown.length ? (
          <View>
            {shown.map((item, index) => (
              <ListRow key={item.key} title={item.title} subtitle={item.detail} subtitleTone={item.late ? "danger" : "muted"} onPress={item.open} last={index === shown.length - 1} />
            ))}
          </View>
        ) : (
          <EmptyState title="You’re all caught up" message="Reviews, overdue actions and notice dates that need you will appear here."
            action={canUpload ? { label: "Upload a contract", onPress: () => router.push("/new/contract") } : undefined} />
        )}
      </Section>

      <Section title="Workspace">
        <View>
          <ListRow icon="chart" title="Reports" subtitle="Activity, coverage and workload" onPress={() => router.push("/reports")} />
          {canUpload ? <ListRow icon="upload" title="Upload a contract" onPress={() => router.push("/new/contract")} last /> : null}
        </View>
      </Section>
    </Screen>
  );
}
