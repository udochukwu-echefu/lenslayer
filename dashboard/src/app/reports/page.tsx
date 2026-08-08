"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, BarChart3, CheckCircle2, Clock3, Download, FileCheck2, ShieldCheck, TriangleAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import type { ReportActivityItem, ReportRange } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/utils";

const ranges: Array<{ value: ReportRange; label: string }> = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "365d", label: "12 months" },
  { value: "all", label: "All time" },
];

const activityLabels: Record<string, string> = {
  "organization.created": "Workspace created",
  "contract.created": "Contract uploaded",
  "contract.deleted": "Contract deleted",
  "contract.expired": "Contract expired",
  "task.created": "Task created",
  "task.updated": "Task updated",
  "task.deleted": "Task deleted",
  "invitation.created": "Invitation sent",
  "invitation.accepted": "Invitation accepted",
  "invitation.revoked": "Invitation revoked",
  "membership.role_changed": "Member role changed",
  "membership.removed": "Member removed",
  "verification.cases_bootstrapped": "Verify cases loaded",
  "verification.decision_recorded": "Verify decision recorded",
};

function activityContext(item: ReportActivityItem) {
  const values = item.detail;
  const candidate = item.contract_title ?? values.title ?? values.reference ?? values.email ?? values.name;
  return typeof candidate === "string" && candidate.trim() ? candidate : "Workspace";
}

function statusTone(value: number, attention = false) {
  if (!value) return "quiet";
  return attention ? "attention" : "steady";
}

export default function ReportsPage() {
  const { activeOrganization, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const [range, setRange] = useState<ReportRange>("30d");
  const query = useQuery({
    queryKey: ["report-overview", organizationId, range],
    queryFn: () => api.reportOverview(organizationId, range),
    enabled: Boolean(organizationId),
  });
  const report = query.data;
  const peak = useMemo(() => Math.max(
    1,
    ...(report?.timeline.map((point) => (
      point.contracts_created
      + point.tasks_created
      + point.tasks_completed
      + point.verification_submitted
      + point.decisions_recorded
    )) ?? [1]),
  ), [report]);
  const hasOperationalData = Boolean(
    report && (report.contracts_total || report.tasks_total || report.verification_total),
  );

  return <div className="page reports-page">
    <div className="page-heading reports-heading">
      <div>
        <p className="eyebrow">Operations and governance</p>
        <h1 className="page-title">Reports</h1>
        <p className="page-description">Measure contract flow, human follow-through, and verification decisions from the evidence already retained in this workspace.</p>
      </div>
      <a className={`button secondary ${!report ? "disabled" : ""}`} href={report ? api.reportExportUrl(organizationId, range) : undefined} aria-disabled={!report}>
        <Download size={16} />Export CSV
      </a>
    </div>

    <div className="report-toolbar">
      <div className="task-tabs" role="tablist" aria-label="Report period">
        {ranges.map((item) => <button key={item.value} type="button" role="tab" aria-selected={range === item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}
      </div>
      <p>{report ? <>Snapshot generated <time dateTime={report.generated_at}>{formatDate(report.generated_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</time></> : "Preparing workspace snapshot"}</p>
    </div>

    {query.isLoading ? <PageLoading rows={9} /> : query.error ? <PageError error={query.error} /> : report && <>
      {!hasOperationalData && <section className="report-empty panel">
        <span><BarChart3 size={22} /></span>
        <div><p className="eyebrow">No operating records yet</p><h2>Your first report starts with real work.</h2><p>Upload a contract, create an action, or open the synthetic Verify queue. Lenslayer will build this view from attributable workspace activity.</p></div>
        <div>{canUpload && <Link className="button" href="/contracts/new">Upload a contract <ArrowRight size={15} /></Link>}<Link className="button secondary" href="/verify">Open Verify</Link></div>
      </section>}

      <div className="report-signal-strip" aria-label="Report summary">
        <div><FileCheck2 size={17} /><span><strong>{report.contracts_total}</strong>Contracts created</span><small>{report.contracts_ready} ready</small></div>
        <div><CheckCircle2 size={17} /><span><strong>{report.tasks_completed}</strong>Actions completed</span><small>{report.task_completion_rate}% of created actions</small></div>
        <div><ShieldCheck size={17} /><span><strong>{report.verification_total}</strong>Verify cases</span><small>{report.verification_overrides} recommendation overrides</small></div>
        <div><Activity size={17} /><span><strong>{report.audit_event_count}</strong>Audit events</span><small>Attributable activity</small></div>
      </div>

      <section className="report-primary-grid">
        <div className="report-flow">
          <div className="section-heading"><div><h2>Workspace flow</h2><p>Created, completed, and decided within the selected period</p></div><span className="report-period">{range === "all" ? "All retained records" : ranges.find((item) => item.value === range)?.label}</span></div>
          <div className="report-chart-legend" aria-hidden="true"><span className="contracts">Contracts</span><span className="tasks">Tasks created</span><span className="completed">Tasks completed</span><span className="verify">Verify cases</span><span className="decisions">Decisions</span></div>
          <div className="report-chart-scroll">
            <div className="report-chart" role="img" aria-label="Workspace activity by period">
              {report.timeline.map((point) => {
                const total = point.contracts_created + point.tasks_created + point.tasks_completed + point.verification_submitted + point.decisions_recorded;
                return <div className="report-chart-column" key={point.period_start} aria-label={`${point.label}: ${point.contracts_created} contracts, ${point.tasks_created} tasks created, ${point.tasks_completed} tasks completed, ${point.verification_submitted} verification cases, ${point.decisions_recorded} decisions`}>
                  <div className="report-chart-total">{total || ""}</div>
                  <div className="report-chart-stack" style={{ height: `${Math.max(4, (total / peak) * 100)}%` }}>
                    {point.decisions_recorded > 0 && <span className="decisions" style={{ flex: point.decisions_recorded }} />}
                    {point.verification_submitted > 0 && <span className="verify" style={{ flex: point.verification_submitted }} />}
                    {point.tasks_completed > 0 && <span className="completed" style={{ flex: point.tasks_completed }} />}
                    {point.tasks_created > 0 && <span className="tasks" style={{ flex: point.tasks_created }} />}
                    {point.contracts_created > 0 && <span className="contracts" style={{ flex: point.contracts_created }} />}
                  </div>
                  <span>{point.label}</span>
                </div>;
              })}
            </div>
          </div>
        </div>

        <aside className="report-attention">
          <div className="section-heading"><div><h2>Attention register</h2><p>Current work that may need ownership</p></div></div>
          <Link href="/tasks" className={statusTone(report.tasks_overdue, true)}><TriangleAlert size={16} /><span><strong>{report.tasks_overdue}</strong>Overdue tasks</span><ArrowRight size={14} /></Link>
          <Link href="/tasks" className={statusTone(report.tasks_due_soon, report.tasks_due_soon > 0)}><Clock3 size={16} /><span><strong>{report.tasks_due_soon}</strong>Due in seven days</span><ArrowRight size={14} /></Link>
          <Link href="/verify" className={statusTone(report.verification_pending, report.verification_pending > 0)}><ShieldCheck size={16} /><span><strong>{report.verification_pending}</strong>Verify decisions pending</span><ArrowRight size={14} /></Link>
          <Link href="/contracts" className={statusTone(report.contracts_failed, true)}><FileCheck2 size={16} /><span><strong>{report.contracts_failed}</strong>Failed contract reviews</span><ArrowRight size={14} /></Link>
          <p>Counts reflect current task and case state. They are not automated risk decisions.</p>
        </aside>
      </section>

      <section className="report-breakdown-grid">
        <div>
          <div className="section-heading"><div><h2>Contract throughput</h2><p>Status of contracts created in this period</p></div></div>
          <div className="report-breakdown-list">
            {[["Ready", report.contracts_ready], ["Processing", report.contracts_processing], ["Failed", report.contracts_failed]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong><i style={{ width: `${report.contracts_total ? (Number(count) / report.contracts_total) * 100 : 0}%` }} /></div>)}
          </div>
          <div className="report-distribution">
            <span>Contract types</span>
            {report.contract_types.length ? report.contract_types.slice(0, 5).map((item) => <p key={item.label}><strong>{item.label}</strong><small>{item.count}</small></p>) : <p><strong>No contract types recorded</strong><small>0</small></p>}
          </div>
        </div>
        <div>
          <div className="section-heading"><div><h2>Human execution</h2><p>Current ownership and completed work</p></div></div>
          <div className="report-execution">
            <div><strong>{report.tasks_active}</strong><span>Active now</span></div>
            <div><strong>{report.tasks_completed}</strong><span>Completed in period</span></div>
            <div><strong>{report.task_completion_rate}%</strong><span>Completion rate</span></div>
          </div>
          <div className="report-distribution">
            <span>Active by priority</span>
            {report.active_task_priorities.map((item) => <p key={item.label}><strong>{titleCase(item.label)}</strong><small>{item.count}</small></p>)}
          </div>
        </div>
        <div>
          <div className="section-heading"><div><h2>Verification decisions</h2><p>Human outcomes for cases submitted in this period</p></div></div>
          <div className="report-decision-register">
            <p><span>Approved</span><strong>{report.verification_approved}</strong></p>
            <p><span>Escalated</span><strong>{report.verification_escalated}</strong></p>
            <p><span>Rejected</span><strong>{report.verification_rejected}</strong></p>
            <p><span>Average risk signal</span><strong>{report.verification_average_risk}<small>/100</small></strong></p>
            <p><span>Recommendation overrides</span><strong>{report.verification_overrides}</strong></p>
          </div>
        </div>
      </section>

      <section className="report-governance-grid">
        <div className="report-workload">
          <div className="section-heading"><div><h2>Reviewer workload</h2><p>Current assigned work and completions in the selected period</p></div><UsersRound size={16} /></div>
          <div className="report-table-wrap">
            <table>
              <thead><tr><th>Team member</th><th>Role</th><th>Active</th><th>Overdue</th><th>Completed</th></tr></thead>
              <tbody>{report.workload.map((item) => <tr key={item.user_id}><td><strong>{item.display_name}</strong><span>{item.email}</span></td><td>{titleCase(item.role)}</td><td>{item.active_tasks}</td><td className={item.overdue_tasks ? "attention" : ""}>{item.overdue_tasks}</td><td>{item.completed_in_period}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
        <aside className="report-activity">
          <div className="section-heading"><div><h2>Recent activity</h2><p>Append-only workspace history</p></div><Activity size={16} /></div>
          <div>{report.recent_activity.length ? report.recent_activity.slice(0, 8).map((item) => <article key={item.id}><span /><div><strong>{activityLabels[item.action] ?? titleCase(item.action.replaceAll(".", " "))}</strong><p>{activityContext(item)} · {item.actor_name}</p></div><time dateTime={item.created_at}>{formatDate(item.created_at, { day: "numeric", month: "short" })}</time></article>) : <p className="report-no-activity">No activity falls within this period.</p>}</div>
        </aside>
      </section>

      <p className="report-footnote"><ShieldCheck size={14} />This is a live snapshot of retained workspace records. Deleted or expired records are intentionally absent. Confidence and risk remain separate signals, and every material decision stays with a person.</p>
    </>}
  </div>;
}
