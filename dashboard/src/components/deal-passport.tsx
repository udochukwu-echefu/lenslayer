"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileClock, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { asText, formatDate, titleCase } from "@/lib/utils";
import { PageError, PageLoading } from "./page-states";
import { useWorkspace } from "./workspace-provider";

export function DealPassport({ contractId }: { contractId: string }) {
  const { activeOrganization } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const query = useQuery({ queryKey: ["deal-passport", organizationId, contractId], queryFn: () => api.dealPassport(organizationId, contractId), enabled: Boolean(organizationId) });
  if (query.isLoading) return <PageLoading rows={7} />;
  if (query.error) return <PageError error={query.error} />;
  const item = query.data;
  if (!item) return null;
  const ReadyIcon = item.readiness === "ready" ? CheckCircle2 : AlertTriangle;
  return <section className="deal-passport">
    <header className="passport-head"><div><p className="eyebrow">Decision record</p><h2>Deal Passport</h2><p>A compact view of what is agreed, what is open, and what must happen next.</p></div><div className="passport-actions"><a className="button secondary" href={api.redlineUrl(organizationId, contractId)} download><Download size={15} />Word redline</a><button className="button secondary" type="button" onClick={() => window.print()}><Download size={15} />Print or save PDF</button></div></header>
    <div className={`passport-readiness ${item.readiness}`}><ReadyIcon size={21} /><div><span>Signing readiness</span><strong>{titleCase(item.readiness)}</strong>{item.readiness_reasons.map((reason) => <p key={reason}>{reason}</p>)}</div></div>
    <div className="passport-summary"><div><span>Counterparty</span><strong>{item.counterparty || "Not recorded"}</strong></div><div><span>Agreement</span><strong>{item.contract_type}</strong></div><div><span>Versions</span><strong>{item.versions.length}</strong></div><div><span>Attention</span><strong>{item.overall_attention || "Review"}</strong></div></div>
    <section><p className="eyebrow">Executive brief</p><h3>{item.executive_summary || "No executive summary was returned."}</h3></section>
    <div className="passport-grid">
      <section><div className="passport-section-title"><AlertTriangle size={16} /><h3>Top risks</h3></div>{item.top_risks.length ? item.top_risks.map((risk, index) => <article key={index}><strong>{asText(risk.title, "Clause finding")}</strong><span className={`pill ${String(risk.risk_level || "medium").toLowerCase()}`}>{titleCase(risk.risk_level || "Review")}</span><p>{risk.explanation || risk.recommendation}</p><small>{asText(risk.citation ?? risk.section ?? risk.location, "Confirm in source document")}</small></article>) : <p>No risk findings were returned.</p>}</section>
      <section><div className="passport-section-title"><ListChecks size={16} /><h3>Negotiation outcome</h3></div><dl><div><dt>Accepted</dt><dd>{item.negotiation.accepted_changes.length}</dd></div><div><dt>Rejected</dt><dd>{item.negotiation.rejected_changes.length}</dd></div><div><dt>Unresolved</dt><dd>{item.negotiation.unresolved_points.length}</dd></div></dl><p>{item.negotiation.final_summary}</p></section>
      <section><div className="passport-section-title"><CheckCircle2 size={16} /><h3>Approvals and actions</h3></div>{item.approvals.map((approval) => <p key={approval.id}><strong>{approval.title}</strong><br /><small>{titleCase(approval.status)}{approval.assigned_to ? ` · ${approval.assigned_to}` : ""}</small></p>)}{item.open_actions.map((action) => <p key={action.id}><strong>{action.title}</strong><br /><small>{titleCase(action.status)}{action.owner ? ` · ${action.owner}` : ""}</small></p>)}{!item.approvals.length && !item.open_actions.length && <p>No open approvals or actions.</p>}</section>
      <section><div className="passport-section-title"><FileClock size={16} /><h3>Key dates</h3></div>{item.key_dates.map((date) => <p key={date.id}><strong>{date.title}</strong><br /><small>{formatDate(date.due_at)}{date.owner ? ` · ${date.owner}` : ""}</small></p>)}{!item.key_dates.length && <p>No active lifecycle dates recorded.</p>}</section>
    </div>
  </section>;
}
