"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, ClipboardPlus, Clock3, Download, FileText, MessageSquareText, Quote, Send, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { RiskFinding } from "@/lib/types";
import { asText, formatDate, formatRelativeDate, severity, titleCase } from "@/lib/utils";
import { PageError, PageLoading } from "./page-states";
import { TaskComposer } from "./task-composer";
import { TaskList } from "./task-list";
import { useWorkspace } from "./workspace-provider";
import { ContractCollaboration } from "./contract-collaboration";
import { ContractLifecycle } from "./contract-lifecycle";
import { ContractNegotiation } from "./contract-negotiation";
import { DealPassport } from "./deal-passport";

type Tab = "overview" | "passport" | "risks" | "obligations" | "negotiate" | "ask" | "actions" | "collaboration" | "lifecycle" | "activity";
const tabs: Tab[] = ["overview", "passport", "risks", "obligations", "negotiate", "ask", "actions", "collaboration", "lifecycle", "activity"];

function Finding({ finding, index, contractId }: { finding: RiskFinding; index: number; contractId: string }) {
  const level = severity(finding.risk_level);
  const evidence = finding.evidence || finding.excerpt || finding.quote || finding.clause;
  const location = [finding.citation, finding.section, finding.page ? `Page ${finding.page}` : null, finding.location].filter(Boolean).join(" · ");
  return <article className="finding"><div className="finding-index">{String(index + 1).padStart(2,"0")}</div><div className="finding-body"><header><div><h3>{asText(finding.title, "Clause finding")}</h3>{finding.clause && <p className="finding-clause">{finding.clause}</p>}</div><span className={`pill ${level}`}>{titleCase(finding.risk_level || level)}</span></header>{finding.explanation && <div className="finding-copy"><span>Why it matters</span><p>{finding.explanation}</p></div>}{finding.recommendation && <div className="finding-copy"><span>Suggested next step</span><p>{finding.recommendation}</p></div>}{evidence && <blockquote><Quote size={15} /><div>{location && <cite>{location}</cite>}<p>{evidence}</p></div></blockquote>}{finding.suggested_language && <details><summary>Suggested language <ChevronRight size={14} /></summary><p>{finding.suggested_language}</p></details>}<Link className="finding-task-link" href={{ pathname: "/tasks", query: { new: "1", contractId, category: "risk", sourceKind: "finding", sourceIndex: String(index), title: asText(finding.title, "Review clause finding"), description: finding.recommendation || finding.explanation || "Confirm this finding against the agreement and decide the next step." } }}><ClipboardPlus size={14} />Create follow-up</Link></div></article>;
}

function RecordRows({ items, empty, contractId, category, canCreate, taskCategory }: { items: Array<Record<string, unknown>>; empty: string; contractId: string; category: "obligation" | "deadline" | "payment" | "negotiation"; canCreate: boolean; taskCategory?: "obligation" | "deadline" | "negotiation" }) {
  if (!items.length) return <div className="quiet-panel"><CheckCircle2 size={18} /><p>{empty}</p></div>;
  const resolvedTaskCategory = taskCategory ?? (category === "payment" ? "obligation" : category);
  return <div className="record-list">{items.map((item, index) => {
    const title = asText(item.title ?? item.obligation ?? item.deadline ?? item.action, category === "deadline" ? "Confirm contract deadline" : "Confirm contract obligation");
    const description = asText(item.description ?? item.details ?? item.context ?? item.date, `Verify this ${category} against the agreement, assign an owner, and record the next step.`);
    return <div className="record-row" key={index}><span>{String(index + 1).padStart(2,"0")}</span><div>{Object.entries(item).map(([key, value]) => <p key={key}><strong>{titleCase(key)}</strong>{Array.isArray(value) ? value.join(", ") : asText(value, "—")}</p>)}{canCreate && <Link className="finding-task-link" href={{ pathname: "/tasks", query: { new: "1", contractId, category: resolvedTaskCategory, sourceKind: category, sourceIndex: String(index), title, description } }}><ClipboardPlus size={14} />Create action</Link>}</div></div>;
  })}</div>;
}

export function ContractDetail({ contractId }: { contractId: string }) {
  const { activeOrganization, canDelete, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab") as Tab | null;
    return requested && tabs.includes(requested) ? requested : "overview";
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [question, setQuestion] = useState("");
  const contractQuery = useQuery({
    queryKey: ["contract", organizationId, contractId],
    queryFn: () => api.contract(organizationId, contractId),
    enabled: Boolean(organizationId),
    refetchInterval: (state) => ["queued", "processing", "running"].includes(state.state.data?.status ?? "") ? 4000 : false,
  });
  const reviewQuery = useQuery({ queryKey: ["review", organizationId, contractId], queryFn: () => api.review(organizationId, contractId), enabled: contractQuery.data?.status === "ready", retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1 });
  const jobsQuery = useQuery({ queryKey: ["jobs", organizationId, contractId], queryFn: () => api.jobs(organizationId, contractId), enabled: Boolean(organizationId) });
  const tasksQuery = useQuery({ queryKey: ["tasks", organizationId, { contractId }], queryFn: () => api.tasks(organizationId, { contractId }), enabled: Boolean(organizationId) });
  const activityQuery = useQuery({ queryKey: ["contract-activity", organizationId, contractId], queryFn: () => api.contractActivity(organizationId, contractId), enabled: Boolean(organizationId) && tab === "activity" });
  const deleteMutation = useMutation({ mutationFn: () => api.deleteContract(organizationId, contractId), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["contracts", organizationId] }); router.replace("/contracts"); } });
  const questionMutation = useMutation({ mutationFn: (value: string) => api.askContract(organizationId, contractId, value) });
  const contract = contractQuery.data;
  const review = reviewQuery.data;
  const analysis = review?.analysis;
  const risks = useMemo(() => analysis?.risk_assessment ?? [], [analysis?.risk_assessment]);
  const gaps = useMemo(() => analysis?.missing_protections ?? [], [analysis?.missing_protections]);
  const counts = useMemo(() => risks.reduce((total, finding) => ({ ...total, [severity(finding.risk_level)]: total[severity(finding.risk_level)] + 1 }), { high: 0, medium: 0, low: 0 }), [risks]);
  if (contractQuery.isLoading) return <div className="page"><PageLoading rows={8} /></div>;
  if (contractQuery.error) return <div className="page"><PageError error={contractQuery.error} /></div>;
  if (!contract) return null;
  const moving = ["queued", "processing", "running"].includes(contract.status);

  return <div className="page contract-detail">
    <Link className="back-link" href="/contracts"><ArrowLeft size={15} />Contracts</Link>
    <header className="review-header"><div><div className="review-kicker"><FileText size={14} /><span>{contract.contract_type || "Contract"}</span><span>·</span><span>{contract.source_name}</span></div><h1>{contract.title || contract.source_name}</h1><p>{contract.counterparty || "Counterparty not identified"} · Added {formatDate(contract.created_at)}</p></div><div className="review-state"><span className={`status ${contract.status}`}>{titleCase(contract.status)}</span>{contract.latest_job?.progress_step && <small>{contract.latest_job.progress_step}</small>}</div></header>

    {moving && <div className="processing-banner"><Clock3 size={20} /><div><strong>Review in progress</strong><p>{contract.latest_job?.progress_step || "Preparing the document for analysis"}. This page updates automatically.</p></div><span className="processing-line" /></div>}
    {contract.status === "failed" && <div className="error-banner"><AlertTriangle size={20} /><div><strong>The review could not finish</strong><p>{contract.latest_job?.error_message || "Inspect the activity log, then upload the document again."}</p></div></div>}

    {reviewQuery.isLoading && contract.status === "ready" ? <PageLoading rows={7} /> : reviewQuery.error ? <PageError error={reviewQuery.error} /> : analysis ? <>
      <div className="review-signals"><div><span>Attention</span><strong>{analysis.overall_attention || (counts.high ? "High" : counts.medium ? "Review" : "Routine")}</strong></div><div><span>High risks</span><strong>{counts.high}</strong></div><div><span>Protection gaps</span><strong>{gaps.length}</strong></div><div><span>Obligations</span><strong>{analysis.obligations?.length ?? 0}</strong></div><div><span>Source quality</span><strong>{asText(review.quality.quality, "Parsed")}</strong></div></div>
      <div className="review-tabs" role="tablist" aria-label="Contract review sections">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item === "ask" ? "Ask contract" : titleCase(item)}{item === "risks" && <span>{risks.length + gaps.length}</span>}{item === "actions" && (tasksQuery.data?.length ?? 0) > 0 && <span>{tasksQuery.data?.length}</span>}</button>)}</div>
      <div className="review-content">
        {tab === "passport" && <DealPassport contractId={contractId} />}
        {tab === "overview" && <div className="overview-layout"><section><p className="eyebrow">Executive summary</p><h2>{analysis.executive_summary || "The analysis did not return an executive summary."}</h2>{Array.isArray(review.quality.warnings) && review.quality.warnings.length > 0 && <div className="quality-warning"><AlertTriangle size={18} /><div><strong>Extraction needs verification</strong>{review.quality.warnings.map((item, index) => <p key={index}>{asText(item)}</p>)}</div></div>}{analysis.uncertainties?.length ? <div className="uncertainty"><ShieldAlert size={18} /><div><strong>Review uncertainties</strong>{analysis.uncertainties.map((item, index) => <p key={index}>{typeof item === "string" ? item : asText(item.description ?? item.detail ?? item.title)}</p>)}</div></div> : null}</section><aside><dl><div><dt>Governing law</dt><dd>{analysis.governing_law || asText(contract.review_context.jurisdiction)}</dd></div><div><dt>Perspective</dt><dd>{asText(contract.review_context.party_role)}</dd></div><div><dt>Primary goal</dt><dd>{asText(contract.review_context.goal)}</dd></div><div><dt>Source text retained</dt><dd>{review.source_text_retained ? "Yes" : "No"}</dd></div><div><dt>Expires</dt><dd>{contract.expires_at ? formatDate(contract.expires_at) : "Not scheduled"}</dd></div></dl><div className="export-block"><span>Export review</span><div>{(["pdf","docx","csv","md","json"] as const).map((format) => <a key={format} href={api.contractExportUrl(organizationId, contractId, format)} download><Download size={13} />{format === "md" ? "Markdown" : format.toUpperCase()}</a>)}</div></div></aside></div>}
        {tab === "risks" && <section><div className="content-heading"><div><p className="eyebrow">Evidence-linked findings</p><h2>Risks and protection gaps</h2></div><p>Prioritised from the selected perspective. A possible gap means the protection was not detected, not that it is legally required.</p></div>{risks.length ? <div className="findings">{risks.map((finding,index) => <Finding key={`${finding.title}-${index}`} finding={finding} index={index} contractId={contractId} />)}</div> : <div className="quiet-panel"><CheckCircle2 size={18} /><p>No clause risks were returned. This does not mean the agreement is risk-free.</p></div>}<h3 className="subsection-title">Possible protection gaps</h3><RecordRows items={gaps.map((item) => typeof item === "string" ? { issue: item } : item)} empty="No possible protection gaps were returned." contractId={contractId} category="negotiation" taskCategory="negotiation" canCreate={canUpload} /></section>}
        {tab === "obligations" && <section><div className="content-heading"><div><p className="eyebrow">Commitments</p><h2>Obligations, payments, and dates</h2></div><p>Verify owners, amounts, and dates before moving them into a system of record.</p></div><h3 className="subsection-title">Obligations</h3><RecordRows items={analysis.obligations ?? []} empty="No obligations were extracted." contractId={contractId} category="obligation" canCreate={canUpload} /><h3 className="subsection-title">Payments</h3><RecordRows items={analysis.payments ?? []} empty="No payment terms were extracted." contractId={contractId} category="payment" taskCategory="obligation" canCreate={canUpload} /><h3 className="subsection-title">Deadlines</h3><RecordRows items={analysis.deadlines ?? []} empty="No deadlines were extracted." contractId={contractId} category="deadline" canCreate={canUpload} /></section>}
        {tab === "negotiate" && <section><div className="content-heading"><div><p className="eyebrow">Prepare the next move</p><h2>Negotiation and playbook</h2></div><p>Turn findings into ranked asks, fallback positions, and escalation points.</p></div><h3 className="subsection-title">Negotiation priorities</h3><RecordRows items={(analysis.negotiation_priorities ?? []).map((item) => typeof item === "string" ? { priority: item } : item)} empty="No negotiation priorities were returned." contractId={contractId} category="negotiation" canCreate={canUpload} /><div className="playbook-summary"><div><p className="eyebrow">Review playbook</p><h3>{analysis.playbook_evaluation?.playbook_name || "Baseline commercial review"}</h3><p>Deterministic checks compare returned findings with the preferred positions, fallbacks, and escalation triggers in the baseline playbook.</p></div><dl>{Object.entries(analysis.playbook_evaluation?.summary ?? {}).map(([key, value]) => <div key={key}><dt>{titleCase(key)}</dt><dd>{value}</dd></div>)}</dl></div><RecordRows items={analysis.playbook_evaluation?.deviations ?? []} empty="No playbook deviations were matched." contractId={contractId} category="negotiation" canCreate={canUpload} /><ContractNegotiation contractId={contractId} /></section>}
        {tab === "ask" && <section className="qa-section"><div className="content-heading"><div><p className="eyebrow">Document Q&amp;A</p><h2>Ask the retained contract</h2></div><p>Answers are limited to retrieved excerpts and preserve the evidence used.</p></div>{review.source_text_retained ? <><form className="qa-form" onSubmit={(event) => { event.preventDefault(); if (question.trim().length >= 3) questionMutation.mutate(question.trim()); }}><MessageSquareText size={18} /><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What does the agreement say about termination notice?" aria-label="Contract question" /><button className="button" type="submit" disabled={questionMutation.isPending || question.trim().length < 3}>{questionMutation.isPending ? "Reviewing…" : <><Send size={14} />Ask</>}</button></form>{questionMutation.error && <p className="form-error">{questionMutation.error.message}</p>}{questionMutation.data && <div className="qa-answer"><p className="eyebrow">{questionMutation.data.generated_by === "model" ? "Evidence-grounded answer" : "Relevant excerpts"}</p><div className="qa-answer-copy">{questionMutation.data.answer}</div><div className="qa-sources">{questionMutation.data.sources.map((source) => <blockquote key={source.label}><cite>{source.label} · {source.location}</cite><p>{source.excerpt}</p></blockquote>)}</div></div>}</> : <div className="qa-unavailable"><ShieldAlert size={20} /><div><strong>Source text was not retained for this review.</strong><p>Contract Q&amp;A needs retained extracted text. Upload a new review with “Retain extracted source text” enabled. The structured report and exports remain available.</p></div></div>}</section>}
        {tab === "actions" && <section><div className="content-heading"><div><p className="eyebrow">Human follow-through</p><h2>Actions for this contract</h2></div><p>Assign what needs to be verified, negotiated, escalated, or delivered. Extracted findings remain evidence, not automatic work.</p></div><div className="contract-task-composer panel"><TaskComposer contractId={contractId} /></div>{tasksQuery.isLoading ? <PageLoading rows={4} /> : tasksQuery.error ? <PageError error={tasksQuery.error} /> : <TaskList tasks={tasksQuery.data ?? []} empty="No actions have been created for this contract." />}</section>}
        {tab === "collaboration" && <ContractCollaboration contractId={contractId} />}
        {tab === "lifecycle" && <ContractLifecycle contractId={contractId} />}
        {tab === "activity" && <section><div className="content-heading"><div><p className="eyebrow">Complete audit history</p><h2>Activity</h2></div><p>Every material action, actor, and processing change recorded for this contract.</p></div>{activityQuery.isLoading ? <PageLoading rows={5} /> : activityQuery.error ? <PageError error={activityQuery.error} /> : <div className="activity-list">{(activityQuery.data ?? []).map((event) => <div key={event.id}><span className="activity-dot completed" /><div><strong>{titleCase(event.action.replaceAll(".", " "))}</strong><p>{event.actor_name || "System"}{Object.keys(event.detail).length ? ` · ${Object.entries(event.detail).slice(0, 3).map(([key, value]) => `${titleCase(key)}: ${asText(value)}`).join(" · ")}` : ""}</p></div><time>{formatRelativeDate(event.created_at)}</time></div>)}</div>}<h3 className="subsection-title">Processing jobs</h3><div className="activity-list">{(jobsQuery.data ?? []).map((job) => <div key={job.id}><span className={`activity-dot ${job.status}`} /><div><strong>{titleCase(job.kind)} · {titleCase(job.status)}</strong><p>{job.progress_step}{job.error_message ? ` · ${job.error_message}` : ""}</p></div><time>{formatRelativeDate(job.completed_at || job.started_at || job.created_at)}</time></div>)}</div>{canDelete && <><div className="danger-zone"><div><strong>Delete this contract</strong><p>Removes the review record and retained source material. This cannot be undone.</p></div>{confirmDelete ? <div className="delete-confirm"><span>Delete permanently?</span><button className="button danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? "Deleting…" : "Yes, delete"}</button><button className="button ghost" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : <button className="button danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} />Delete</button>}</div>{deleteMutation.error && <p className="form-error">{deleteMutation.error.message}</p>}</>}</section>}
      </div>
    </> : !moving && contract.status !== "failed" ? <div className="callout">The contract exists, but its review is not available yet.</div> : null}
  </div>;
}
