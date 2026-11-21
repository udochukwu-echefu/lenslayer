import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { dateKey, daysUntil, formatDate, reminderChoices, reminderLabel, titleCase } from "@/lib/format";
import { flatten, invalidateWorkspaceRecords, overviewWindow, useLifecycleList, useTaskCounts, useTaskList } from "@/lib/queries";
import type { LifecycleItem, Recurrence, WorkflowTask } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { font, radius, space } from "@/theme/tokens";
import { HeaderButton } from "./header";
import { LoadMore } from "./load-more";
import { RenewalsMonth } from "./renewals-month";
import { TaskRow } from "./task-row";
import { UpcomingReminders } from "./upcoming-reminders";
import { AppText, Button, Chips, DateBlock, EmptyState, ErrorState, Facts, FormError, Icon, ListRow, Loading, Screen, Section, Segmented, Sheet } from "./ui";

type Mode = "dates" | "tasks";
type DateView = "agenda" | "month" | "reminders";

/**
 * The Renewals tab: one screen with two views. "Dates" is the calendar side
 * (renewals, notice windows, payments, obligations). "Tasks" is the human
 * follow-through. They share a tab because a date usually ends in a task.
 */
export function RenewalsView({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const { organizationId, canUpload } = useWorkspace();
  const [dateSubview, setDateSubview] = useState<{ organizationId: string; view: DateView }>({ organizationId, view: "agenda" });
  if (dateSubview.organizationId !== organizationId) setDateSubview({ organizationId, view: "agenda" });
  const dateView = dateSubview.organizationId === organizationId ? dateSubview.view : "agenda";

  function toggleDateView(view: "month" | "reminders") {
    setDateSubview({ organizationId, view: dateView === view ? "agenda" : view });
  }

  const exportCalendar = useMutation({ mutationFn: () => api.downloadCalendarExport(organizationId) });
  // Pull to refresh reloads every list this tab can show (dates, month, reminders, tasks).
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try { await invalidateWorkspaceRecords(queryClient, organizationId, "lifecycle", "tasks"); } finally { setRefreshing(false); }
  }
  return (
    <Screen contentStyle={{ gap: space.xl - 4 }} onRefresh={() => void refresh()} refreshing={refreshing}>
      <Stack.Screen options={{
        title: "Renewals",
        headerRight: () => (
          <View style={{ flexDirection: "row" }}>
            {mode === "dates" ? (
              <>
                <HeaderButton icon="renewals" label="Month view" selected={dateView === "month"} onPress={() => toggleDateView("month")} />
                <HeaderButton icon="clock" label="Scheduled reminders" selected={dateView === "reminders"} onPress={() => toggleDateView("reminders")} />
                <HeaderButton icon="share" label="Add these dates to your calendar" onPress={() => exportCalendar.mutate()} />
              </>
            ) : null}
            {canUpload ? <HeaderButton icon="plus" label={mode === "dates" ? "Add a date" : "New action"} onPress={() => router.push(mode === "dates" ? "/new/lifecycle" : "/new/task")} /> : null}
          </View>
        ),
      }} />
      <Segmented label="Renewals view" value={mode} onChange={(next) => { if (next !== mode) setDateSubview({ organizationId, view: "agenda" }); setMode(next); }} options={[{ value: "dates", label: "Dates" }, { value: "tasks", label: "Tasks" }]} />
      <FormError error={exportCalendar.error} />
      {mode === "dates" ? <DateViews key={organizationId} view={dateView} /> : <Tasks />}
    </Screen>
  );
}

function DateViews({ view }: { view: DateView }) {
  const [open, setOpen] = useState<LifecycleItem | null>(null);
  return (
    <>
      {view === "month" ? <RenewalsMonth /> : view === "reminders" ? <UpcomingReminders onOpen={setOpen} /> : <Dates onOpen={setOpen} />}
      <DateSheet key={open?.id ?? "none"} item={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Dates({ onOpen }: { onOpen: (item: LifecycleItem) => void }) {
  const styles = useStyles();
  const { organizationId, canUpload } = useWorkspace();
  const [window] = useState(() => overviewWindow());
  const query = useLifecycleList(organizationId, { status: "active", sort: "due_at" });
  const { items, total } = flatten(query.data);
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
            {items.map((item, index) => <DateRow key={item.id} item={item} last={index === items.length - 1} onPress={() => onOpen(item)} />)}
            <LoadMore shown={items.length} total={total} noun="dates" hasNextPage={query.hasNextPage} isFetchingNextPage={query.isFetchingNextPage} fetchNextPage={query.fetchNextPage} />
          </View>
        ) : (
          <EmptyState icon="renewals" title="No dates yet" message="Add a renewal, notice window or payment date once someone has checked it against the agreement."
            action={canUpload ? { label: "Add a date", onPress: () => router.push("/new/lifecycle") } : undefined} />
        )}
      </Section>
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

/** Detail for one date: the countdown, who owns it, its reminder, and the two things you can do about it. */
function DateSheet({ item: initial, onClose }: { item: LifecycleItem | null; onClose: () => void }) {
  const styles = useStyles();
  const { organizationId, canUpload } = useWorkspace();
  const queryClient = useQueryClient();
  // The sheet keeps its own copy so a saved reminder shows straight away.
  const [item, setItem] = useState(initial);
  const [editing, setEditing] = useState(false);
  const update = useMutation({
    mutationFn: (status: "completed" | "cancelled") => api.updateLifecycle(organizationId, item!.id, { status }),
    onSuccess: async () => { await invalidateWorkspaceRecords(queryClient, organizationId, "lifecycle"); onClose(); },
  });
  const schedule = useMutation({
    mutationFn: (change: { reminder_days?: number; recurrence?: Recurrence }) => api.updateLifecycle(organizationId, item!.id, change),
    onSuccess: (saved) => { setItem(saved); void invalidateWorkspaceRecords(queryClient, organizationId, "lifecycle"); },
  });
  if (!item) return null;
  if (editing) {
    return (
      <Sheet title="Reminder and repeat" visible onClose={onClose} action={{ label: "Done", onPress: () => setEditing(false) }}>
        <ReminderEditor item={item} saving={schedule.isPending} onChange={(change) => schedule.mutate(change)} />
        <FormError error={schedule.error} />
      </Sheet>
    );
  }
  const days = daysUntil(item.due_at);
  const repeat = item.recurrence === "none" ? "Never repeats" : `Repeats ${item.recurrence}`;
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
        ...(item.amount ? [["Amount", item.amount] as [string, string]] : []),
      ]} />
      <ListRow icon="bell" title={reminderLabel(item.reminder_days)} subtitle={repeat}
        onPress={canUpload && item.status === "active" ? () => setEditing(true) : undefined} last />
      {item.description ? <AppText variant="small" tone="muted">{item.description}</AppText> : null}
      <FormError error={update.error} />
      <View style={styles.actions}>
        <Button label="Open agreement" variant="secondary" style={styles.flex} onPress={() => { onClose(); router.push({ pathname: "/contract/[id]", params: { id: item.contract_id, tab: "lifecycle" } }); }} />
        {canUpload ? <Button label="Mark done" icon="check" style={styles.flex} loading={update.isPending} onPress={() => update.mutate("completed")} /> : null}
      </View>
    </Sheet>
  );
}

const repeatChoices: { value: Recurrence; label: string }[] = [
  { value: "none", label: "Never" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

/**
 * When the owner hears about a date, and whether it comes back. Each tap saves,
 * the way iOS settings do, so there is no separate Save button to miss.
 */
function ReminderEditor({ item, saving, onChange }: { item: LifecycleItem; saving: boolean; onChange: (change: { reminder_days?: number; recurrence?: Recurrence }) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const leads: number[] = [...reminderChoices];
  if (!leads.includes(item.reminder_days)) leads.push(item.reminder_days);
  leads.sort((a, b) => a - b);
  const repeats = item.recurrence === "weekly" ? [...repeatChoices, { value: "weekly" as const, label: "Weekly" }] : repeatChoices;
  return (
    <>
      <View>
        <AppText variant="eyebrow" tone="muted">Remind the owner</AppText>
        {leads.map((days, index) => {
          const selected = days === item.reminder_days;
          return (
            <Pressable key={days} accessibilityRole="radio" accessibilityState={{ selected, disabled: saving }} disabled={saving}
              onPress={() => { if (!selected) onChange({ reminder_days: days }); }}
              style={({ pressed }) => [styles.choice, index < leads.length - 1 && styles.choiceDivider, pressed && styles.pressed]}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{reminderLabel(days)}</AppText>
                {days === 90 ? <AppText variant="small" tone="muted">Good for long notice periods</AppText> : null}
              </View>
              {selected ? <Icon name="check" size={16} color={colors.accent} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.repeat}>
        <AppText variant="eyebrow" tone="muted">Repeat</AppText>
        <Segmented label="Repeat" options={repeats} value={item.recurrence} onChange={(recurrence) => { if (!saving && recurrence !== item.recurrence) onChange({ recurrence }); }} />
      </View>
      <AppText variant="small" tone="muted">Still open on the day? Admins are told, so it never slips quietly.</AppText>
    </>
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
  choice: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 50, paddingVertical: space.xs },
  choiceDivider: { borderBottomWidth: 1, borderBottomColor: c.line },
  repeat: { gap: space.sm },
}));
