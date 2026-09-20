"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileClock, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { asText, formatDate, titleCase } from "@/lib/utils";
import { PageError, PageLoading } from "./page-states";
import { useWorkspace } from "./workspace-provider";

export function DealPassport({ contractId }: { contractId: string }) {
  const { activeOrganization, isDemo } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const query = useQuery({ queryKey: ["deal-passport", organizationId, contractId], queryFn: () => api.dealPassport(organizationId, contractId), enabled: Boolean(organizationId) });
  if (query.isLoading) return <PageLoading rows={7} />;
  if (query.error) return <PageError error={query.error} />;
  const item = query.data;
  if (!item) return null;
  const ReadyIcon = item.readiness === "ready" ? CheckCircle2 : AlertTriangle;
  return <section className="deal-passport">
    <header className="passport-head"><div><p className="eyebrow">Decision record</p><h2>Deal Passport</h2><p>A compact view of what is agreed, what is open, and what must happen next.</p></div><div className="passport-actions">{!isDemo && <button className="button secondary" type="button" onClick={() => void api.downloadRedline(organizationId, contractId)}><Download size={15} />Word redline</button>}<button className="button secondary" type="button" onClick={() => window.print()}><Download size={15} />Print or save PDF</button></div></header>
    <div className={`passport-readiness ${item.readiness}`}><span className="passport-readiness-icon"><ReadyIcon size={20} /></span><div><span>Signing readiness</span><strong>{titleCase(item.readiness)}</strong>{item.readiness_reasons.length > 0 && <ul>{item.readiness_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div></div>
    <div className="passport-summary"><div><span>Counterparty</span><strong>{item.counterparty || "Not recorded"}</strong></div><div><span>Agreement</span><strong>{item.contract_type}</strong></div><div><span>Versions</span><strong>{item.versions.length}</strong></div><div><span>Attention</span><strong>{item.overall_attention || "Review"}</strong></div></div>
    <section className="passport-brief"><p className="eyebrow">Executive brief</p><h3>{item.executive_summary || "No executive summary was returned."}</h3></section>
    <div className="passport-grid">
      <section className="passport-card"><div className="passport-section-title"><AlertTriangle size={16} /><div><h3>Top risks</h3><span>{item.top_risks.length} flagged</span></div></div><div className="passport-card-list">{item.top_risks.length ? item.top_risks.map((risk, index) => <article className="passport-risk" key={index}><header><strong>{asText(risk.title, "Clause finding")}</strong><span className={`pill ${String(risk.risk_level || "medium").toLowerCase()}`}>{titleCase(risk.risk_level || "Review")}</span></header><p>{risk.explanation || risk.recommendation}</p><small>{asText(risk.citation ?? risk.section ?? risk.location, "Confirm in source document")}</small></article>) : <p className="passport-empty">No risk findings were returned.</p>}</div></section>
      <section className="passport-card"><div className="passport-section-title"><ListChecks size={16} /><div><h3>Negotiation outcome</h3><span>{item.negotiation.checklist_count} tracked points</span></div></div><dl className="passport-outcomes"><div><dt>Accepted</dt><dd>{item.negotiation.accepted_changes.length}</dd></div><div><dt>Rejected</dt><dd>{item.negotiation.rejected_changes.length}</dd></div><div><dt>Unresolved</dt><dd>{item.negotiation.unresolved_points.length}</dd></div></dl><p className="passport-card-summary">{item.negotiation.final_summary}</p></section>
      <section className="passport-card"><div className="passport-section-title"><CheckCircle2 size={16} /><div><h3>Approvals and actions</h3><span>{item.approvals.length + item.open_actions.length} open items</span></div></div><div className="passport-card-list">{item.approvals.map((approval) => <article className="passport-list-item" key={approval.id}><strong>{approval.title}</strong><small>{titleCase(approval.status)}{approval.assigned_to ? ` · ${approval.assigned_to}` : ""}</small></article>)}{item.open_actions.map((action) => <article className="passport-list-item" key={action.id}><strong>{action.title}</strong><small>{titleCase(action.status)}{action.owner ? ` · ${action.owner}` : ""}</small></article>)}{!item.approvals.length && !item.open_actions.length && <p className="passport-empty">No open approvals or actions.</p>}</div></section>
      <section className="passport-card"><div className="passport-section-title"><FileClock size={16} /><div><h3>Key dates</h3><span>{item.key_dates.length} active</span></div></div><div className="passport-card-list">{item.key_dates.map((date) => <article className="passport-list-item" key={date.id}><strong>{date.title}</strong><small>{formatDate(date.due_at)}{date.owner ? ` · ${date.owner}` : ""}</small></article>)}{!item.key_dates.length && <p className="passport-empty">No active lifecycle dates recorded.</p>}</div></section>
    </div>
  </section>;
}
