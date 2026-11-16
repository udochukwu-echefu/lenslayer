import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { dateKey, daysUntil, formatDate, titleCase } from "@/lib/format";
import { flatten, invalidateWorkspaceRecords, overviewWindow, useLifecycleList, useTaskCounts, useTaskList } from "@/lib/queries";
import type { LifecycleItem, WorkflowTask } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { font, radius, space } from "@/theme/tokens";
import { HeaderButton } from "./header";
import { LoadMore } from "./load-more";
import { TaskRow } from "./task-row";
import { AppText, Button, Chips, DateBlock, EmptyState, ErrorState, Facts, FormError, Loading, Screen, Section, Segmented, Sheet } from "./ui";

type Mode = "dates" | "tasks";

/**
 * The Renewals tab: one screen with two views. "Dates" is the calendar side
 * (renewals, notice windows, payments, obligations). "Tasks" is the human
 * follow-through. They share a tab because a date usually ends in a task.
 */
export function RenewalsView({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const { organizationId, canUpload } = useWorkspace();
  const exportCalendar = useMutation({ mutationFn: () => api.downloadCalendarExport(organizationId) });
  return (
    <Screen contentStyle={{ gap: space.xl - 4 }}>
      <Stack.Screen options={{
        title: "Renewals",
        headerRight: () => (
          <View style={{ flexDirection: "row" }}>
            {mode === "dates" ? <HeaderButton icon="share" label="Add these dates to your calendar" onPress={() => exportCalendar.mutate()} /> : null}
            {canUpload ? <HeaderButton icon="plus" label={mode === "dates" ? "Add a date" : "New action"} onPress={() => router.push(mode === "dates" ? "/new/lifecycle" : "/new/task")} /> : null}
          </View>
        ),
      }} />
      <Segmented label="Renewals view" value={mode} onChange={setMode} options={[{ value: "dates", label: "Dates" }, { value: "tasks", label: "Tasks" }]} />
      <FormError error={exportCalendar.error} />
      {mode === "dates" ? <Dates /> : <Tasks />}
    </Screen>
  );
}

function Dates() {
  const styles = useStyles();
  const { organizationId, canUpload } = useWorkspace();
  const [window] = useState(() => overviewWindow());
  const query = useLifecycleList(organizationId, { status: "active", sort: "due_at" });
  const { items, total } = flatten(query.data);
  const [open, setOpen] = useState<LifecycleItem | null>(null);
  const today = new Date(window.day_start);
  const week = Array.from({ length: 7 }, (_, index) => { const day = new Date(today); day.setDate(today.getDate() + index); return day; });
  const byDay = new Map<string, LifecycleItem[]>();
  for (const item of items) { const key = dateKey(new Date(item.due_at)); byDay.set(key, [...(byDay.get(key) ?? []), item]); }
  const dueToday = byDay.get(dateKey(today))?.length ?? 0;
  const next = items.find((item) => daysUntil(item.due_at) > 0);

  return (
    <>
      <View style={styles.week} accessibilityLabel="This week">
        {week.map((day, index) => {
          const due = byDay.get(dateKey(day)) ?? [];
          return (
            <View key={day.toISOString()} style={[styles.day, index === 0 && styles.dayOn]}>
              <AppText style={[styles.dayName, index === 0 && styles.dayOnText]}>{day.toLocaleDateString(undefined, { weekday: "short" })}</AppText>
              <AppText style={[styles.dayNumber, index === 0 && styles.dayOnText]}>{day.getDate()}</AppText>
              <View style={[styles.dayDot, due.length ? (due.some((item) => item.escalated_at) ? styles.dotUrgent : index === 0 ? styles.dotOn : styles.dotDue) : null]} />
            </View>
          );
        })}
      </View>
      <AppText variant="small" tone="muted">
        {dueToday ? `${dueToday} due today.` : next ? `Nothing due today. Next date in ${daysUntil(next.due_at)} ${daysUntil(next.due_at) === 1 ? "day" : "days"}.` : "Nothing due today."}
      </AppText>

      <Section title="Coming up">
        {query.isLoading ? <Loading rows={4} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : items.length ? (
          <View>
            {items.map((item, index) => <DateRow key={item.id} item={item} last={index === items.length - 1} onPress={() => setOpen(item)} />)}
            <LoadMore shown={items.length} total={total} noun="dates" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
          </View>
        ) : (
          <EmptyState icon="renewals" title="No dates yet" message="Add a renewal, notice window or payment date once someone has checked it against the agreement."
            action={canUpload ? { label: "Add a date", onPress: () => router.push("/new/lifecycle") } : undefined} />
        )}
      </Section>
      <DateSheet item={open} onClose={() => setOpen(null)} />
    </>
  );
}

function DateRow({ item, last, onPress }: { item: LifecycleItem; last: boolean; onPress: () => void }) {
  const styles = useStyles();
  const days = daysUntil(item.due_at);
  const urgent = days <= 14 || Boolean(item.escalated_at);
  const when = days < 0 ? `${-days} ${days === -1 ? "day" : "days"} late` : days === 0 ? "Due today" : `${days} ${days === 1 ? "day" : "days"} left`;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}>
      <DateBlock date={new Date(item.due_at)} urgent={urgent} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={2}>{item.title}</AppText>
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {!item.owner_name ? <AppText variant="smallStrong" tone="danger">No owner · </AppText> : null}
          {item.contract_title}{` · ${when}`}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Detail for one date: the countdown, who owns it, and the two things you can do about it. */
function DateSheet({ item, onClose }: { item: LifecycleItem | null; onClose: () => void }) {
  const styles = useStyles();
  const { organizationId, canUpload } = useWorkspace();
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (status: "completed" | "cancelled") => api.updateLifecycle(organizationId, item!.id, { status }),
    onSuccess: async () => { await invalidateWorkspaceRecords(queryClient, organizationId, "lifecycle"); onClose(); },
  });
  if (!item) return null;
  const days = daysUntil(item.due_at);
  return (
    <Sheet title={item.title} visible onClose={onClose} action={{ label: "Done", onPress: onClose }}>
      <View style={styles.hero}>
        <AppText variant="caption" tone="muted">{titleCase(item.kind)}</AppText>
        <AppText style={styles.heroNumber}>{Math.abs(days)}</AppText>
        <AppText variant="smallStrong">{days < 0 ? (days === -1 ? "day late" : "days late") : days === 1 ? "day left" : "days left"}</AppText>
        <AppText variant="small" tone="muted">{formatDate(item.due_at, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</AppText>
      </View>
      <Facts items={[
        ["Agreement", item.contract_title || "–"],
        ["Owner", item.owner_name || "Unassigned"],
        ["Remind", `${item.reminder_days} days before`],
        ["Repeat", item.recurrence === "none" ? "Never" : titleCase(item.recurrence)],
        ...(item.amount ? [["Amount", item.amount] as [string, string]] : []),
      ]} />
      {item.description ? <AppText variant="small" tone="muted">{item.description}</AppText> : null}
      <FormError error={update.error} />
      <View style={styles.actions}>
        <Button label="Open agreement" variant="secondary" style={styles.flex} onPress={() => { onClose(); router.push({ pathname: "/contract/[id]", params: { id: item.contract_id, tab: "lifecycle" } }); }} />
        {canUpload ? <Button label="Mark done" icon="check" style={styles.flex} loading={update.isPending} onPress={() => update.mutate("completed")} /> : null}
      </View>
    </Sheet>
  );
}

type Scope = "active" | "mine" | "done" | "all";

function Tasks() {
  const { organizationId, user, canUpload } = useWorkspace();
  const [scope, setScope] = useState<Scope>("active");
  const counts = useTaskCounts(organizationId);
  const query = useTaskList(organizationId, {
    sort: "due_at",
    status: scope === "done" ? "done" : scope === "all" ? undefined : "open,in_progress",
    assigned_to_user_id: scope === "mine" ? user?.id : undefined,
  });
  const { items, total } = flatten(query.data);
  const open = scope === "active" || scope === "mine";
  const group = (task: WorkflowTask) => {
    if (!open) return "";
    if (!task.due_at) return "No date";
    const days = daysUntil(task.due_at);
    return days < 0 ? "Overdue" : days <= 7 ? "This week" : "Later";
  };
  const groups = new Map<string, WorkflowTask[]>();
  for (const task of items) groups.set(group(task), [...(groups.get(group(task)) ?? []), task]);

  return (
    <>
      <Chips label="Filter actions" value={scope} onChange={setScope} options={[
        { value: "active", label: "Active", count: counts.data?.active_tasks },
        { value: "mine", label: "Assigned to me" },
        { value: "done", label: "Done", count: counts.data?.completed_tasks },
        { value: "all", label: "All" },
      ]} />
      {query.isLoading ? <Loading rows={5} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !items.length ? (
        <EmptyState title={scope === "done" ? "Nothing completed yet" : "No open actions"} message="Actions are created by people from a finding, an obligation or a date. Nothing is assigned automatically."
          action={canUpload ? { label: "New action", onPress: () => router.push("/new/task") } : undefined} />
      ) : (
        <>
          {[...groups.entries()].map(([name, tasks]) => (
            <Section key={name || "all"} title={name ? `${name} · ${tasks.length}` : `${total} ${total === 1 ? "action" : "actions"}`}>
              <View>{tasks.map((task, index) => <TaskRow key={task.id} task={task} last={index === tasks.length - 1} />)}</View>
            </Section>
          ))}
          <LoadMore shown={items.length} total={total} noun="actions" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
        </>
      )}
    </>
  );
}

const useStyles = createStyles((c) => ({
  week: { flexDirection: "row", gap: 4 },
  day: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 8, borderRadius: radius.md },
  dayOn: { backgroundColor: c.primary },
  dayOnText: { color: c.onPrimary },
  dayName: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, color: c.muted },
  dayNumber: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22, color: c.ink },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },
  dotDue: { backgroundColor: c.ink },
  dotOn: { backgroundColor: c.onPrimary },
  dotUrgent: { backgroundColor: c.danger },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  pressed: { opacity: 0.6 },
  flex: { flex: 1, gap: space.xxs },
  hero: { alignItems: "center", gap: 2, paddingVertical: 18, borderRadius: 20, backgroundColor: c.warningSoft },
  heroNumber: { fontFamily: font.bold, fontSize: 48, lineHeight: 52, letterSpacing: -1 },
  actions: { flexDirection: "row", gap: space.md },
}));
