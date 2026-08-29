"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, BarChart3, CalendarClock, Clock3, Download, FileWarning, ListChecks, UsersRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "@/components/page-states";
import { IdentityCell } from "@/components/ui/identity-cell";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import type { ReportActivityItem, ReportRange, ReportTimelinePoint } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/utils";

const ranges: Array<{ value: ReportRange; label: string }> = [
  { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }, { value: "365d", label: "12 months" }, { value: "all", label: "All time" },
];

const activityLabels: Record<string, string> = {
  "organization.created": "Workspace created", "contract.created": "Contract uploaded", "contract.deleted": "Contract deleted", "contract.expired": "Contract expired",
  "contract.review_ready": "Contract review ready", "contract.review_failed": "Contract review failed", "task.created": "Task created", "task.updated": "Task updated", "task.deleted": "Task deleted",
  "invitation.created": "Invitation sent", "invitation.accepted": "Invitation accepted", "invitation.revoked": "Invitation revoked", "membership.role_changed": "Member role changed", "membership.removed": "Member removed",
};

function timelineTotal(point: ReportTimelinePoint) {
  return point.contracts_created + point.tasks_created + point.tasks_completed + point.decisions_recorded;
}

function activityContext(item: ReportActivityItem) {
  const candidate = item.contract_title ?? item.detail.title ?? item.detail.reference ?? item.detail.email ?? item.detail.name;
  return typeof candidate === "string" && candidate.trim() ? candidate : "Workspace";
}

export default function ReportsPage() {
  const { activeOrganization, canUpload, isDemo } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const [range, setRange] = useState<ReportRange>("30d");
  const [focusedPeriod, setFocusedPeriod] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["report-overview", organizationId, range], queryFn: () => api.reportOverview(organizationId, range), enabled: Boolean(organizationId) });
  const report = query.data;
  const chartMax = useMemo(() => Math.max(4, ...(report?.timeline.map(timelineTotal) ?? [4])), [report]);
  const chartTotal = useMemo(() => report?.timeline.reduce((sum, point) => sum + timelineTotal(point), 0) ?? 0, [report]);
  const hasData = Boolean(report && (report.contracts_total || report.tasks_total || report.audit_event_count));
  const selected = report?.timeline.find((point) => point.period_start === focusedPeriod) ?? report?.timeline.at(-1);
  const readyPercent = report?.contracts_total ? Math.round((report.contracts_ready / report.contracts_total) * 100) : 0;
  const processingPercent = report?.contracts_total ? Math.round((report.contracts_processing / report.contracts_total) * 100) : 0;
  const failedPercent = report?.contracts_total ? Math.round((report.contracts_failed / report.contracts_total) * 100) : 0;

  return <div className="page reports-page">
    <div className="page-heading reports-heading"><div><h1 className="page-title">Reports</h1><p className="page-description">Contract processing, evidence coverage, human execution, and reviewer workload for the selected period.</p></div>{report && hasData && !isDemo ? <a className="button secondary" href={api.reportExportUrl(organizationId, range)}><Download size={16} />Export CSV</a> : <button className="button secondary" disabled title={isDemo ? "Exports are disabled in the read-only demo." : "No report rows are available for export."}><Download size={16} />Export CSV</button>}</div>
    <div className="report-toolbar"><div className="task-tabs" role="tablist" aria-label="Report period">{ranges.map((item) => <button key={item.value} type="button" role="tab" aria-selected={range === item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}</div><p>{report ? <>Updated <time dateTime={report.generated_at}>{formatDate(report.generated_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time></> : "Preparing report"}</p></div>

    {query.isLoading ? <PageLoading rows={9} /> : query.error ? <PageError error={query.error} /> : report && (!hasData ? <section className="inline-state report-empty"><BarChart3 size={20} /><div><h2>No reportable activity for this period</h2><p>Choose another period or create a contract review in an authorised workspace.</p></div><div>{canUpload && <Link className="button" href="/contracts/new">Upload a contract <ArrowRight size={15} /></Link>}{isDemo && <Link className="button secondary" href="/contracts/demo-msa">Explore sample report</Link>}</div></section> : <>
      <section className="report-attention-strip" aria-label="Items needing attention">
        <Link href="/tasks"><span className={report.tasks_overdue ? "attention-icon danger" : "attention-icon"}><ListChecks size={17} /></span><span><small>Overdue actions</small><strong>{report.tasks_overdue}</strong></span><ArrowRight size={15} /></Link>
        <Link href="/tasks"><span className={report.tasks_due_soon ? "attention-icon warning" : "attention-icon"}><Clock3 size={17} /></span><span><small>Due in 7 days</small><strong>{report.tasks_due_soon}</strong></span><ArrowRight size={15} /></Link>
        <Link href="/contracts"><span className={report.contracts_failed ? "attention-icon danger" : "attention-icon"}><FileWarning size={17} /></span><span><small>Failed reviews</small><strong>{report.contracts_failed}</strong></span><ArrowRight size={15} /></Link>
        <Link href="/calendar"><span className={report.upcoming_obligations ? "attention-icon info" : "attention-icon"}><CalendarClock size={17} /></span><span><small>Obligations in 30 days</small><strong>{report.upcoming_obligations}</strong></span><ArrowRight size={15} /></Link>
      </section>

      <section className="report-flow-section">
        <div className="section-heading"><div><h2>Workspace activity</h2><p>Contracts, assigned work, completed work, and recorded decisions</p></div><span className="report-period">{ranges.find((item) => item.value === range)?.label}</span></div>
        <div className="report-chart-summary"><div><small>Recorded activity</small><strong>{chartTotal}</strong><span>events in range</span></div><div aria-live="polite"><small>{focusedPeriod ? "Selected period" : "Latest period"}</small><strong>{selected?.label ?? "No period"}</strong><span>{selected ? timelineTotal(selected) : 0} events</span></div></div>
        <div className="report-chart-legend" aria-hidden="true"><span className="contracts">Contracts</span><span className="tasks">Tasks created</span><span className="completed">Tasks completed</span><span className="decisions">Human decisions</span></div>
        <div className="report-bars" role="group" aria-label="Workspace activity by period">{report.timeline.map((point) => {
          const total = timelineTotal(point);
          return <div className="report-bar-period" key={point.period_start} role="img" tabIndex={0} aria-label={`${point.label}: ${point.contracts_created} contracts, ${point.tasks_created} tasks created, ${point.tasks_completed} tasks completed, ${point.decisions_recorded} decisions`} onMouseEnter={() => setFocusedPeriod(point.period_start)} onMouseLeave={() => setFocusedPeriod(null)} onFocus={() => setFocusedPeriod(point.period_start)} onBlur={() => setFocusedPeriod(null)}><strong>{total}</strong><div className="report-bar-track"><div className="report-bar-stack" style={{ height: `${total ? Math.max(8, (total / chartMax) * 100) : 0}%` }}><i className="decisions" style={{ flex: point.decisions_recorded }} /><i className="completed" style={{ flex: point.tasks_completed }} /><i className="tasks" style={{ flex: point.tasks_created }} /><i className="contracts" style={{ flex: point.contracts_created }} /></div></div><span>{point.label}</span></div>;
        })}</div>
        <table className="sr-only"><caption>Workspace activity by period</caption><thead><tr><th>Period</th><th>Contracts</th><th>Tasks created</th><th>Tasks completed</th><th>Human decisions</th></tr></thead><tbody>{report.timeline.map((point) => <tr key={point.period_start}><th>{point.label}</th><td>{point.contracts_created}</td><td>{point.tasks_created}</td><td>{point.tasks_completed}</td><td>{point.decisions_recorded}</td></tr>)}</tbody></table>
      </section>

      <section className="report-operations-grid">
        <div className="report-throughput"><div className="section-heading"><div><h2>Contract throughput</h2><p>Current state of {report.contracts_total} retained contracts</p></div></div><div className="throughput-total"><strong>{report.contracts_total}</strong><span>Contracts in register</span></div><div className="throughput-track" aria-label={`${readyPercent}% ready, ${processingPercent}% processing, ${failedPercent}% failed`}><i className="ready" style={{ width: `${readyPercent}%` }} /><i className="processing" style={{ width: `${processingPercent}%` }} /><i className="failed" style={{ width: `${failedPercent}%` }} /></div><div className="throughput-legend"><p><i className="ready" /><span>Ready</span><strong>{report.contracts_ready}</strong><small>{readyPercent}%</small></p><p><i className="processing" /><span>Processing</span><strong>{report.contracts_processing}</strong><small>{processingPercent}%</small></p><p><i className="failed" /><span>Failed</span><strong>{report.contracts_failed}</strong><small>{failedPercent}%</small></p></div><div className="report-definitions"><Link href="/contracts"><span>Evidence coverage</span><strong>{report.evidence_coverage}%</strong><small>{report.evidence_backed_findings} of {report.material_findings_total} material findings include a source excerpt</small></Link><Link href="/contracts"><span>Average completion time</span><strong>{report.average_review_completion_hours || "—"}{report.average_review_completion_hours ? "h" : ""}</strong><small>Across {report.review_completed_count} completed review{report.review_completed_count === 1 ? "" : "s"}</small></Link></div></div>
        <div className="report-human"><div className="section-heading"><div><h2>Human execution</h2><p>Assigned work completed by people in this workspace</p></div></div><div className="execution-rate"><div style={{ "--completion": `${report.task_completion_rate}%` } as React.CSSProperties}><strong>{report.task_completion_rate}%</strong><span>Completion rate</span></div><p><span><strong>{report.tasks_completed}</strong> completed</span><span><strong>{report.tasks_active}</strong> active</span><span><strong>{report.tasks_overdue}</strong> overdue</span></p></div><div className="execution-priorities"><h3>Active work by priority</h3>{report.active_task_priorities.length ? report.active_task_priorities.map((item) => <p key={item.label}><span>{titleCase(item.label)}</span><strong>{item.count}</strong></p>) : <p><span>No active priorities</span><strong>0</strong></p>}</div><p className="report-definition-note">Completion rate is completed tasks divided by all tasks in the selected period. Automated findings are excluded.</p></div>
      </section>

      <section className="report-governance-grid"><div className="report-workload"><div className="section-heading"><div><h2>Reviewer workload</h2><p>Assigned work and completions in the selected period</p></div><UsersRound size={17} /></div><div className="report-table-wrap"><table><thead><tr><th scope="col">Team member</th><th scope="col">Role</th><th scope="col">Active</th><th scope="col">Overdue</th><th scope="col">Completed</th></tr></thead><tbody>{report.workload.map((item) => <tr key={item.user_id}><td><IdentityCell displayName={item.display_name} email={item.email} /></td><td>{titleCase(item.role)}</td><td>{item.active_tasks}</td><td className={item.overdue_tasks ? "attention" : ""}>{item.overdue_tasks}</td><td>{item.completed_in_period}</td></tr>)}</tbody></table></div></div><aside className="report-activity"><div className="section-heading"><div><h2>Recent activity</h2><p>Append-only workspace history</p></div><Activity size={17} /></div><div>{report.recent_activity.length ? report.recent_activity.slice(0, 8).map((item) => <article key={item.id}><span /><div><strong>{activityLabels[item.action] ?? titleCase(item.action.replaceAll(".", " "))}</strong><p>{activityContext(item)} · {item.actor_name}</p></div><time dateTime={item.created_at}>{formatDate(item.created_at, { day: "numeric", month: "short" })}</time></article>) : <p className="report-no-activity">No activity falls within this period.</p>}</div></aside></section>
      <p className="report-footnote">Selected period: {ranges.find((item) => item.value === range)?.label}. Automated findings and human decisions are reported separately.</p>
    </>)}
  </div>;
}
