import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { dateKey, titleCase } from "@/lib/format";
import { useCalendarGrid } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { radius, space, touch } from "@/theme/tokens";
import { HeaderButton } from "./header";
import { AppText, EmptyState, ErrorState, ListRow, Loading, Section } from "./ui";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthStart = (date: Date, offset = 0) => new Date(date.getFullYear(), date.getMonth() + offset, 1, 12);

/** A month at a glance and the dated records for the selected day. */
export function RenewalsMonth() {
  const styles = useStyles();
  const { organizationId } = useWorkspace();
  const [today] = useState(() => new Date());
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(() => monthStart(today));
  const gridStart = new Date(month);
  gridStart.setDate(1 - ((month.getDay() + 6) % 7));
  const weeks = Array.from({ length: 6 }, (_, week) => weekdays.map((_, weekday) => {
    const day = new Date(gridStart);
    day.setDate(day.getDate() + week * 7 + weekday);
    return day;
  }));
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const query = useCalendarGrid(organizationId, { month: dateKey(month), grid_start: dateKey(gridStart), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const byDay = new Map(query.data?.days.map((day) => [day.date, day]));
  const day = byDay.get(dateKey(selected));

  function moveMonth(offset: number) {
    const next = monthStart(month, offset);
    setMonth(next);
    setSelected(next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth() ? today : next);
  }

  return (
    <>
      <View style={styles.toolbar}>
        <AppText variant="title" accessibilityRole="header" style={styles.title}>{monthLabel}</AppText>
        <HeaderButton icon="chevronLeft" label="Previous month" onPress={() => moveMonth(-1)} />
        <HeaderButton icon="chevronRight" label="Next month" onPress={() => moveMonth(1)} />
      </View>
      {query.isLoading ? <Loading rows={6} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : (
        <>
          <View accessibilityLabel={`${monthLabel} calendar`}>
            <View style={styles.week}>
              {weekdays.map((weekday) => <AppText key={weekday} variant="caption" tone="muted" style={styles.weekday}>{weekday}</AppText>)}
            </View>
            {weeks.map((week) => (
              <View key={dateKey(week[0])} style={styles.week}>
                {week.map((date) => {
                  const key = dateKey(date);
                  const dayData = byDay.get(key);
                  const count = dayData?.total ?? 0;
                  const escalated = dayData?.items.some((item) => item.escalated);
                  const active = key === dateKey(selected);
                  const current = key === dateKey(today);
                  const outside = date.getMonth() !== month.getMonth();
                  const label = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
                  return (
                    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: active }}
                      accessibilityLabel={`${label}${current ? ", today" : ""}, ${count} ${count === 1 ? "item" : "items"}`}
                      onPress={() => setSelected(date)} style={[styles.day, active && styles.selected]}>
                      <AppText variant="smallStrong" tone={current ? "accent" : outside ? "muted" : "ink"} style={active && styles.selectedText}>{date.getDate()}</AppText>
                      {count > 0 ? <View style={[styles.dot, active ? styles.selectedDot : escalated && styles.escalatedDot]} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <Section title={selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}>
            {day?.items.length ? day.items.map((item, index) => (
              <ListRow key={`${item.kind}-${item.id}`} icon={item.kind === "task" ? "check" : "renewals"} title={item.title}
                subtitle={item.kind === "task" ? "Action" : titleCase(item.category)} value={item.escalated ? "Escalated" : undefined}
                onPress={() => {
                  if (item.contract_id) router.push({ pathname: "/contract/[id]", params: { id: item.contract_id, tab: item.kind === "task" ? "actions" : "lifecycle" } });
                  else if (item.kind === "task") router.push("/renewals/tasks");
                }} last={index === day.items.length - 1} />
            )) : <EmptyState icon="renewals" message="Nothing is due on this day." />}
            {day && day.total > day.items.length ? <AppText variant="small" tone="muted">Showing {day.items.length} of {day.total} items. Open the agenda or Tasks to see more.</AppText> : null}
          </Section>
        </>
      )}
    </>
  );
}

const useStyles = createStyles((c) => ({
  toolbar: { flexDirection: "row", alignItems: "center" },
  title: { flex: 1 },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", paddingBottom: space.sm },
  day: { flex: 1, minHeight: touch, gap: space.xxs, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  selected: { backgroundColor: c.primary },
  selectedText: { color: c.onPrimary },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.ink },
  selectedDot: { backgroundColor: c.onPrimary },
  escalatedDot: { backgroundColor: c.danger },
}));
