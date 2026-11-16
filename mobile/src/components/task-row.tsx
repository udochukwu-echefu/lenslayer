import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/lib/api";
import { daysUntil, formatDate } from "@/lib/format";
import { invalidateWorkspaceRecords } from "@/lib/queries";
import type { TaskStatus, WorkflowTask } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { useTheme } from "@/theme/theme-provider";
import { space, touch } from "@/theme/tokens";
import { TaskDetail } from "./task-detail";
import { AppText, EmptyState, FormError, Icon } from "./ui";

/** "5 days late", "Due today", "Sat 21 Nov" — the one fact a person scans a task list for. */
function dueText(task: WorkflowTask) {
  if (task.status === "done") return { text: task.completed_at ? `Done ${formatDate(task.completed_at, { day: "numeric", month: "short" })}` : "Done", late: false };
  if (!task.due_at) return { text: "No due date", late: false };
  const days = daysUntil(task.due_at);
  if (days < 0) return { text: `${-days} ${days === -1 ? "day" : "days"} late`, late: true };
  if (days === 0) return { text: "Due today", late: false };
  return { text: formatDate(task.due_at, { weekday: "short", day: "numeric", month: "short" }), late: false };
}

/**
 * A human-owned action. The square completes or reopens it; tapping the row
 * opens the action details. Viewers see the details read-only (the backend
 * enforces this too).
 */
export function TaskRow({ task, last }: { task: WorkflowTask; last?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { organizationId, canUpload } = useWorkspace();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState(false);
  const mutation = useMutation({
    mutationFn: (status: TaskStatus) => api.updateTask(organizationId, task.id, { status }),
    onSuccess: () => invalidateWorkspaceRecords(queryClient, organizationId, "tasks"),
  });
  const done = task.status === "done";
  const due = dueText(task);
  const rest = [task.contract_title, task.assigned_to_name || "Unassigned"].filter(Boolean).join(" · ");

  return (
    <View style={[styles.row, !last && styles.divider]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: !canUpload }}
        accessibilityLabel={!canUpload ? `${task.title} status is read only` : done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        disabled={!canUpload || mutation.isPending}
        onPress={() => mutation.mutate(done ? "open" : "done")}
        hitSlop={10}
        style={styles.check}
      >
        <View style={[styles.box, done && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          {done ? <Icon name="check" size={12} color={colors.onPrimary} /> : null}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityHint="Open action details" onPress={() => setSheet(true)} style={styles.body}>
        <AppText variant="bodyStrong" style={done && styles.doneText} numberOfLines={2}>{task.title}</AppText>
        <AppText variant="small" tone="muted" numberOfLines={1}>
          <AppText variant="small" tone={due.late ? "danger" : "muted"}>{due.text}</AppText>
          {rest ? ` · ${rest}` : ""}
        </AppText>
        <FormError error={mutation.error} />
      </Pressable>
      {sheet ? <TaskDetail task={task} onClose={() => setSheet(false)} /> : null}
    </View>
  );
}

export function TaskList({ tasks, empty = "No actions match this view." }: { tasks: WorkflowTask[]; empty?: string }) {
  if (!tasks.length) return <EmptyState message={empty} />;
  return <View>{tasks.map((task, index) => <TaskRow key={task.id} task={task} last={index === tasks.length - 1} />)}</View>;
}

const useStyles = createStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 13, minHeight: 58 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.line },
  check: { width: touch, height: touch, alignItems: "center", justifyContent: "center" },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: space.xxs },
  doneText: { textDecorationLine: "line-through", opacity: 0.55 },
}));
