import { useMutation, useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { HeaderButton } from "@/components/header";
import { AppText, ErrorState, FormError, ListRow, Loading, Screen, Section, Segmented } from "@/components/ui";
import { api } from "@/lib/api";
import { formatRelativeDate } from "@/lib/format";
import type { ReportRange, ReportTimelinePoint } from "@/lib/shared/types";
import { useWorkspace } from "@/lib/workspace";
import { createStyles } from "@/theme/create-styles";
import { font, space } from "@/theme/tokens";

const ranges: { value: ReportRange; label: string }[] = [
  { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }, { value: "365d", label: "12 months" }, { value: "all", label: "All" },
];
const BAR_HEIGHT = 72;

const events = (point: ReportTimelinePoint) => point.contracts_created + point.tasks_created + point.tasks_completed + point.decisions_recorded;
/** The API may send a share as 0–1 or 0–100; show a whole percentage either way. */
const percent = (value: number) => `${Math.round(value <= 1 ? value * 100 : value)}%`;

/**
 * Workspace reporting. One bar per period with its count written on top and
 * the newest bar in ink, then three plain totals saying what the activity was.
 * Labelled directly, so the chart needs no legend.
 */
export default function ReportsScreen() {
  const styles = useStyles();
  const { organizationId } = useWorkspace();
  const [range, setRange] = useState<ReportRange>("30d");
  const query = useQuery({ queryKey: ["report-overview", organizationId, range], queryFn: () => api.reportOverview(organizationId, range), enabled: Boolean(organizationId) });
  const exportCsv = useMutation({ mutationFn: () => api.downloadReportExport(organizationId, range) });
  const report = query.data;
  const timeline = (report?.timeline ?? []).slice(-6);
  const peak = Math.max(1, ...timeline.map(events));
  const total = (report?.timeline ?? []).reduce((sum, point) => sum + events(point), 0);
  const sum = (pick: (point: ReportTimelinePoint) => number) => (report?.timeline ?? []).reduce((value, point) => value + pick(point), 0);
  const busiest = [...(report?.workload ?? [])].sort((a, b) => b.active_tasks - a.active_tasks)[0];

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching} contentStyle={{ gap: space.xl }}>
      <Stack.Screen options={{ headerRight: () => <HeaderButton icon="share" label="Export report as CSV" onPress={() => exportCsv.mutate()} /> }} />
      <Segmented label="Report period" value={range} onChange={setRange} options={ranges} />
      <FormError error={exportCsv.error} />

      {query.isLoading ? <Loading rows={6} /> : query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : report ? (
        <>
          <View>
            <View style={styles.spread}>
              <AppText variant="eyebrow" tone="muted">Activity</AppText>
              <AppText variant="caption" tone="faint">{`Updated ${formatRelativeDate(report.generated_at)}`}</AppText>
            </View>
            <AppText style={styles.total}>{total} <AppText tone="muted" style={styles.unit}>{total === 1 ? "event" : "events"}</AppText></AppText>

            {timeline.length ? (
              <>
                <View style={styles.bars} accessible accessibilityRole="image" accessibilityLabel={`Events per period: ${timeline.map((point) => `${point.label} ${events(point)}`).join(", ")}`}>
                  {timeline.map((point, index) => {
                    const latest = index === timeline.length - 1;
                    return (
                      <View key={point.period_start} style={styles.bar}>
                        <AppText style={styles.barValue} tone={latest ? "ink" : "muted"}>{events(point)}</AppText>
                        <View style={[styles.barFill, latest && styles.barLatest, { height: Math.max(4, Math.round((events(point) / peak) * BAR_HEIGHT)) }]} />
                      </View>
                    );
                  })}
                </View>
                <View style={styles.labels}>
                  {timeline.map((point, index) => (
                    <AppText key={point.period_start} style={[styles.barLabel, index === timeline.length - 1 && styles.barLabelLatest]} tone={index === timeline.length - 1 ? "ink" : "faint"} numberOfLines={1}>{point.label}</AppText>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.mix}>
              <Mix value={sum((point) => point.contracts_created)} label="Contracts" dot="contracts" />
              <Mix value={sum((point) => point.tasks_created + point.tasks_completed)} label="Actions" dot="actions" />
              <Mix value={sum((point) => point.decisions_recorded)} label="Decisions" dot="decisions" />
            </View>
          </View>

          <View>
            <ListRow title="Evidence coverage" subtitle={`${report.evidence_backed_findings} of ${report.material_findings_total} material findings quote a clause`} trailing={<AppText variant="number">{percent(report.evidence_coverage)}</AppText>} />
            <ListRow title="Action completion" subtitle={`${report.tasks_completed} done · ${report.tasks_active} active · ${report.tasks_overdue} overdue`} trailing={<AppText variant="number">{percent(report.task_completion_rate)}</AppText>} />
            <ListRow title="Average review time" subtitle="Upload to ready" trailing={<AppText variant="number">{report.review_completed_count ? `${Math.round(report.average_review_completion_hours * 10) / 10}h` : "–"}</AppText>} />
            <ListRow title="Reviewer workload" subtitle={busiest && busiest.active_tasks ? `${busiest.display_name || busiest.email} has the most open actions (${busiest.active_tasks})` : "No open actions"} onPress={() => router.push("/settings/team")} last />
          </View>

          {report.workload.length ? (
            <Section title="Open actions by person">
              <View>
                {report.workload.map((person, index) => (
                  <ListRow key={person.user_id} title={person.display_name || person.email}
                    subtitle={person.overdue_tasks ? `${person.overdue_tasks} overdue` : `${person.completed_in_period} completed in this period`} subtitleTone={person.overdue_tasks ? "danger" : "muted"}
                    trailing={<AppText variant="number">{person.active_tasks}</AppText>} last={index === report.workload.length - 1} />
                ))}
              </View>
            </Section>
          ) : null}
          <AppText variant="caption" tone="faint">Automated findings and human decisions are counted separately.</AppText>
        </>
      ) : null}
    </Screen>
  );
}

function Mix({ value, label, dot }: { value: number; label: string; dot: "contracts" | "actions" | "decisions" }) {
  const styles = useStyles();
  return (
    <View style={styles.mixItem}>
      <AppText style={styles.mixValue}>{value}</AppText>
      <View style={styles.mixLabel}>
        <View style={[styles.dot, styles[dot]]} />
        <AppText variant="small" tone="muted">{label}</AppText>
      </View>
    </View>
  );
}

const useStyles = createStyles((c) => ({
  spread: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  total: { fontFamily: font.semibold, fontSize: 34, lineHeight: 40, letterSpacing: -0.6, marginTop: 6, marginBottom: space.lg },
  unit: { fontFamily: font.medium, fontSize: 15, letterSpacing: 0 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 14, height: BAR_HEIGHT + 24, borderBottomWidth: 1, borderBottomColor: c.line },
  bar: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
  barValue: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16, fontVariant: ["tabular-nums"] },
  barFill: { width: "100%", maxWidth: 44, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: c.well },
  barLatest: { backgroundColor: c.ink },
  labels: { flexDirection: "row", gap: 14, marginTop: space.sm },
  barLabel: { flex: 1, textAlign: "center", fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  barLabelLatest: { fontFamily: font.semibold },
  mix: { flexDirection: "row", marginTop: space.lg },
  mixItem: { flex: 1, gap: space.xxs },
  mixValue: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24, fontVariant: ["tabular-nums"] },
  mixLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  contracts: { backgroundColor: c.contracts },
  actions: { backgroundColor: c.actions },
  decisions: { backgroundColor: c.decisions },
}));
