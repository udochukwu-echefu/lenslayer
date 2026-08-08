"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardCheck, FileCheck2, FileText, FlaskConical, Quote, ScanLine, ShieldAlert, UserCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import type { ReconciliationStatus, VerificationAction, VerificationFinding, VerificationStatus } from "@/lib/types";
import { formatDate, formatRelativeDate, titleCase } from "@/lib/utils";
import { verificationStatusLabel, verificationTone } from "@/lib/verification";
import { AppSelect } from "./app-select";
import { PageError, PageLoading } from "./page-states";
import { useWorkspace } from "./workspace-provider";

type Tab = "overview" | "evidence" | "workflow" | "decision" | "audit";
const decisions: VerificationAction[] = ["Approve", "Escalate", "Reject"];
const workflowStatuses: VerificationStatus[] = ["pending", "in_review", "needs_information", "escalated", "approved", "rejected", "closed"];

function Finding({ finding, index }: { finding: VerificationFinding; index: number }) {
  const tone = finding.severity.toLowerCase();
  return <article className="verify-finding"><div className="verify-finding-number">{String(index + 1).padStart(2, "0")}</div><div className="verify-finding-body"><header><div><span>+{finding.points} risk points</span><h3>{finding.title}</h3></div><span className={`pill ${tone}`}>{finding.severity}</span></header><p>{finding.explanation}</p><div className="verify-reviewer-action"><strong>Reviewer action</strong><p>{finding.action}</p></div><div className="verify-evidence-grid">{finding.evidence.map((item, evidenceIndex) => <div className="verify-evidence-item" key={`${item.document}-${item.field}-${evidenceIndex}`}><div><Quote size={13} /><span>{item.document}</span><small>{Math.round(item.confidence * 100)}% extraction confidence</small></div><strong>{String(item.value)}</strong><p>{titleCase(item.field)} · {item.reference}</p></div>)}</div></div></article>;
}

export function VerificationDetail({ caseId }: { caseId: string }) {
  const { activeOrganization, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [decision, setDecision] = useState<VerificationAction | null>(null);
  const [rationale, setRationale] = useState("");
  const [assignee, setAssignee] = useState("");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [canonicalValue, setCanonicalValue] = useState("");
  const [reconciliationStatus, setReconciliationStatus] = useState<ReconciliationStatus>("needs_review");
  const [resolutionNote, setResolutionNote] = useState("");
  const query = useQuery({ queryKey: ["verification-case", organizationId, caseId], queryFn: () => api.verificationCase(organizationId, caseId), enabled: Boolean(organizationId) });
  const members = useQuery({ queryKey: ["members", organizationId], queryFn: () => api.members(organizationId), enabled: Boolean(organizationId) });
  const audit = useQuery({ queryKey: ["verification-audit", organizationId, caseId], queryFn: () => api.verificationAudit(organizationId, caseId), enabled: Boolean(organizationId) && tab === "audit" });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["verification-case", organizationId, caseId] }),
      queryClient.invalidateQueries({ queryKey: ["verification-cases", organizationId] }),
      queryClient.invalidateQueries({ queryKey: ["verification-audit", organizationId, caseId] }),
    ]);
  };
  const decisionMutation = useMutation({
    mutationFn: (payload: { decision: VerificationAction; rationale: string }) => api.recordVerificationDecision(organizationId, caseId, payload),
    onSuccess: async () => { setRationale(""); await refresh(); },
  });
  const assignmentMutation = useMutation({
    mutationFn: () => api.assignVerificationCase(organizationId, caseId, { assigned_to_user_id: assignee || null, note: assignmentNote }),
    onSuccess: async () => { setAssignmentNote(""); await refresh(); },
  });
  const statusMutation = useMutation({
    mutationFn: (status: VerificationStatus) => api.updateVerificationCase(organizationId, caseId, { status }),
    onSuccess: refresh,
  });
  const reconciliationMutation = useMutation({
    mutationFn: () => api.reconcileVerificationEvidence(organizationId, caseId, { field_name: fieldName, canonical_value: canonicalValue, status: reconciliationStatus, resolution_note: resolutionNote }),
    onSuccess: async () => { setFieldName(""); setCanonicalValue(""); setResolutionNote(""); await refresh(); },
  });
  const documentMutation = useMutation({
    mutationFn: (documentId: string) => api.reviewVerificationDocument(organizationId, caseId, documentId, { scan_status: "clean", extraction_status: "ready", confidence: 100 }),
    onSuccess: refresh,
  });

  if (query.isLoading) return <div className="page"><PageLoading rows={8} /></div>;
  if (query.error) return <div className="page"><PageError error={query.error} /></div>;
  const item = query.data;
  if (!item) return null;
  const selectedDecision = decision ?? item.suggested_action;
  const latest = item.latest_decision;
  const unresolved = item.reconciliations.filter((entry) => entry.status === "conflict" || entry.status === "needs_review");

  function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    decisionMutation.mutate({ decision: selectedDecision, rationale: rationale.trim() });
  }

  function submitReconciliation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    reconciliationMutation.mutate();
  }

  return <div className="page verification-detail">
    <Link className="back-link" href="/verify"><ArrowLeft size={15} />Verification queue</Link>
    <div className={`verification-case-banner ${item.synthetic ? "" : "live"}`}>{item.synthetic ? <FlaskConical size={16} /> : <FileCheck2 size={16} />}<span>{item.synthetic ? "Synthetic case" : `${titleCase(item.intake_channel)} intake`}</span><small>{item.synthetic ? "Deterministic reconciliation rules" : "Private retained evidence"}</small></div>
    <header className="verification-case-header"><div><p className="eyebrow">Onboarding review · {item.reference}</p><h1>{item.applicant_name}</h1><p>Submitted {formatDate(item.submitted_at)} · {item.document_count} evidence source{item.document_count === 1 ? "" : "s"} · {titleCase(item.priority)} priority</p></div><div className="verification-recommendation"><span>System recommendation</span><strong className={verificationTone(item.suggested_action)}>{item.suggested_action}</strong><small>{latest ? `Latest human decision: ${latest.decision}` : item.assigned_to_name ? `Assigned to ${item.assigned_to_name}` : "Unassigned"}</small></div></header>

    <div className="verification-signals" aria-label="Verification case summary"><div><span>Risk score</span><strong className={item.risk_score >= 70 ? "high" : item.risk_score >= 20 ? "medium" : "low"}>{item.risk_score}<small>/100</small></strong></div><div><span>Unresolved</span><strong>{unresolved.length || item.finding_count}</strong></div><div><span>Documents</span><strong>{item.document_count}</strong></div><div><span>Confidence</span><strong>{item.average_confidence}%</strong></div><div><span>Case status</span><strong className={`case-state ${item.status}`}>{verificationStatusLabel(item.status)}</strong></div></div>

    <div className="review-tabs" role="tablist" aria-label="Verification case sections">{(["overview", "evidence", "workflow", "decision", "audit"] as Tab[]).map((value) => <button type="button" key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === "overview" ? "Case review" : titleCase(value)}{value === "overview" && <span>{item.finding_count}</span>}{value === "evidence" && <span>{item.reconciliations.length}</span>}{value === "decision" && item.decision_history.length > 0 && <span>{item.decision_history.length}</span>}</button>)}</div>

    <div className="verification-content">
      {tab === "overview" && <section><div className="verification-brief"><div><p className="eyebrow">Compliance summary</p><h2>{item.summary}</h2></div><aside><span>Why this recommendation</span><p>{item.reasoning}</p></aside></div><div className="content-heading"><div><p className="eyebrow">Explainable rules</p><h2>Flagged discrepancies</h2></div><p>Risk severity and extraction confidence are separate signals. Inspect both before deciding.</p></div>{item.findings.length ? <div className="verify-findings">{item.findings.map((finding, index) => <Finding finding={finding} index={index} key={`${finding.code}-${index}`} />)}</div> : <div className="quiet-panel"><CheckCircle2 size={18} /><p>No automated discrepancies are recorded. Review uploaded evidence and reconciliation status before deciding.</p></div>}</section>}

      {tab === "evidence" && <section><div className="content-heading"><div><p className="eyebrow">Secure document pipeline</p><h2>Uploaded evidence</h2></div><p>Files remain private; only metadata and reviewer-approved extracted values appear here.</p></div>{item.uploaded_documents.length ? <div className="verification-document-register">{item.uploaded_documents.map((document) => <article key={document.id}><div><FileText size={16} /><span><strong>{document.original_name}</strong><small>{titleCase(document.document_type)} · {Math.ceil(document.size_bytes / 1024)} KB · SHA-256 {document.sha256.slice(0, 12)}…</small></span></div><div className="document-states"><span>{titleCase(document.scan_status)} scan</span><span>{titleCase(document.extraction_status)} extraction</span><span>{document.confidence}% confidence</span></div>{canUpload && document.status !== "ready" && document.scan_status !== "rejected" && <button className="button secondary" type="button" disabled={documentMutation.isPending} onClick={() => documentMutation.mutate(document.id)}><ScanLine size={14} />Mark reviewed</button>}</article>)}</div> : item.documents.length ? <><div className="verify-matrix-wrap"><table className="verify-matrix"><thead><tr>{Object.keys(item.field_matrix[0] ?? {}).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{item.field_matrix.map((row, index) => <tr key={index}>{Object.values(row).map((value, valueIndex) => <td key={valueIndex}>{String(value)}</td>)}</tr>)}</tbody></table></div></> : <div className="quiet-panel"><FileText size={18} /><p>No uploaded document metadata is available.</p></div>}

        <div className="content-heading verify-inventory-heading"><div><p className="eyebrow">Evidence reconciliation</p><h2>Canonical fields and conflicts</h2></div><p>{unresolved.length} unresolved</p></div>{item.reconciliations.length > 0 && <div className="reconciliation-list">{item.reconciliations.map((record) => <article key={record.id}><div><strong>{titleCase(record.field_name)}</strong><span className={`pill ${record.status === "conflict" ? "high" : record.status === "needs_review" ? "medium" : "low"}`}>{titleCase(record.status)}</span></div><p>{record.canonical_value || "No canonical value selected"}</p><small>{record.resolution_note || "Awaiting reviewer note"}{record.resolved_by_name ? ` · ${record.resolved_by_name}` : ""}</small></article>)}</div>}{canUpload && <form className="reconciliation-form" onSubmit={submitReconciliation}><div className="form-grid"><div className="field"><label htmlFor="reconciliation-field">Field</label><input id="reconciliation-field" value={fieldName} onChange={(event) => setFieldName(event.target.value)} placeholder="e.g. legal_name" required /></div><div className="field"><label htmlFor="canonical-value">Canonical value</label><input id="canonical-value" value={canonicalValue} onChange={(event) => setCanonicalValue(event.target.value)} /></div><div className="field"><label htmlFor="reconciliation-status">Status</label><AppSelect id="reconciliation-status" value={reconciliationStatus} onValueChange={(value) => setReconciliationStatus(value as ReconciliationStatus)} options={[{ value: "needs_review", label: "Needs review" }, { value: "conflict", label: "Conflict" }, { value: "matched", label: "Matched" }, { value: "resolved", label: "Resolved" }]} /></div></div><div className="field"><label htmlFor="resolution-note">Resolution note</label><textarea id="resolution-note" className="textarea" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Record the source and reasoning behind the canonical value." /></div><button className="button secondary" type="submit" disabled={fieldName.trim().length < 1 || reconciliationMutation.isPending}><ClipboardCheck size={15} />Save reconciliation</button>{reconciliationMutation.error && <p className="form-error">{reconciliationMutation.error.message}</p>}</form>}</section>}

      {tab === "workflow" && <section><div className="workflow-grid"><div><div className="content-heading"><div><p className="eyebrow">Case ownership</p><h2>Assignment</h2></div></div><div className="workflow-control"><UserRound size={18} /><div><strong>{item.assigned_to_name || "Unassigned"}</strong><span>{item.assigned_to_email || "Choose a reviewer to establish accountability."}</span></div></div>{canUpload && <div className="workflow-form"><div className="field"><label htmlFor="case-assignee">Reviewer</label><AppSelect id="case-assignee" value={assignee} onValueChange={setAssignee} options={[{ value: "", label: "Unassigned" }, ...(members.data ?? []).filter((member) => member.role !== "viewer").map((member) => ({ value: member.user_id, label: member.display_name || member.email }))]} /></div><div className="field"><label htmlFor="assignment-note">Assignment note</label><input id="assignment-note" value={assignmentNote} onChange={(event) => setAssignmentNote(event.target.value)} /></div><button className="button secondary" type="button" disabled={assignmentMutation.isPending} onClick={() => assignmentMutation.mutate()}><UserCheck size={15} />Assign case</button></div>}</div><div><div className="content-heading"><div><p className="eyebrow">Decision workflow</p><h2>Case state</h2></div></div><div className="workflow-statuses">{workflowStatuses.map((status) => <button type="button" key={status} className={item.status === status ? "active" : ""} disabled={!canUpload || item.status === status || statusMutation.isPending} onClick={() => statusMutation.mutate(status)}><span>{verificationStatusLabel(status)}</span>{item.status === status && <Check size={14} />}</button>)}</div>{statusMutation.error && <p className="form-error">{statusMutation.error.message}</p>}</div></div><div className="content-heading decision-history-heading"><div><p className="eyebrow">Assignment history</p><h2>Accountability trail</h2></div><p>{item.assignment_history.length} changes</p></div><div className="verification-history">{[...item.assignment_history].reverse().map((event) => <article key={event.id}><div><strong>{event.assigned_to_name}</strong><time>{formatRelativeDate(event.created_at)}</time></div><p>{event.note || "No assignment note."}</p><small>Assigned by {event.assigned_by_name}</small></article>)}</div></section>}

      {tab === "decision" && <section><div className="decision-intro"><span><UserCheck size={20} /></span><div><p className="eyebrow">Human decision</p><h2>Automation recommends. A reviewer decides.</h2><p>Record the evidence considered and explain any override. Every new decision is appended to the history instead of erasing the previous record.</p></div></div>{canUpload ? <form className="verification-decision-form" onSubmit={submitDecision}><fieldset><legend>Decision</legend><div className="verification-decision-options">{decisions.map((value) => <label className={`${verificationTone(value)} ${selectedDecision === value ? "selected" : ""}`} key={value}><input type="radio" name="decision" value={value} checked={selectedDecision === value} onChange={() => setDecision(value)} /><span>{value === "Approve" ? <CheckCircle2 size={17} /> : value === "Escalate" ? <ShieldAlert size={17} /> : <AlertTriangle size={17} />}{value}</span></label>)}</div></fieldset>{selectedDecision !== item.suggested_action && <div className="decision-override-note"><ShieldAlert size={16} /><p>You are overriding the system recommendation of <strong>{item.suggested_action}</strong>. Explain which evidence supports the change.</p></div>}{selectedDecision === "Approve" && unresolved.length > 0 && <div className="decision-override-note"><ShieldAlert size={16} /><p>Approval is blocked until {unresolved.length} evidence conflict{unresolved.length === 1 ? "" : "s"} are resolved.</p></div>}<div className="field"><label htmlFor="verification-rationale">Reviewer rationale</label><textarea className="textarea" id="verification-rationale" value={rationale} onChange={(event) => setRationale(event.target.value)} minLength={10} maxLength={4000} required placeholder="State which evidence supports the decision and what must happen next." /></div><div className="verification-decision-actions"><button className="button" type="submit" disabled={decisionMutation.isPending || (selectedDecision === "Approve" && unresolved.length > 0)}>{decisionMutation.isPending ? "Recording decision…" : "Record decision"}</button><span>Decisions remain reversible by recording a new entry.</span></div>{decisionMutation.data && <p className="task-created"><Check size={15} />Decision recorded in the audit history.</p>}{decisionMutation.error && <p className="form-error" role="alert">{decisionMutation.error.message}</p>}</form> : <div className="callout"><strong>Read-only access</strong><br />Viewers can inspect the recommendation, evidence, and decision history but cannot record a decision.</div>}<div className="content-heading decision-history-heading"><div><p className="eyebrow">Attributable record</p><h2>Decision history</h2></div><p>{item.decision_history.length} recorded</p></div>{item.decision_history.length ? <div className="verification-history">{[...item.decision_history].reverse().map((event) => <article key={event.id}><div><span className={`pill ${verificationTone(event.decision)}`}>{event.decision}</span><strong>{event.reviewer_name || event.reviewer_email}</strong><time>{formatRelativeDate(event.created_at)}</time></div><p>{event.rationale}</p><small>System recommendation at decision time: {event.recommended_action}{event.decision !== event.recommended_action ? " · Reviewer override" : ""}</small></article>)}</div> : <div className="quiet-panel"><UserCheck size={18} /><p>No human decision has been recorded. The system recommendation is not an approval or rejection.</p></div>}</section>}

      {tab === "audit" && <section><div className="content-heading"><div><p className="eyebrow">Compliance history</p><h2>Immutable case activity</h2></div><p>Identity, timestamp, action, and context</p></div>{audit.isLoading ? <PageLoading rows={5} /> : audit.error ? <PageError error={audit.error} /> : <div className="case-audit-list">{(audit.data ?? []).map((event) => <article key={event.id}><Activity size={15} /><div><strong>{titleCase(event.action.replaceAll(".", " "))}</strong><span>{event.actor_name || event.actor_email || "Secure intake"} · {formatDate(event.created_at)}</span><code>{JSON.stringify(event.detail)}</code></div></article>)}</div>}</section>}
    </div>
  </div>;
}
