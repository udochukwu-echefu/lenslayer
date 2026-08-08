"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, CheckCircle2, Download, Link2, MessageSquareText, Send, ShieldCheck, UserCheck, XCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import type { ApprovalRequest, ApprovalStatus, ContractDecisionName } from "@/lib/types";
import { formatDate, formatRelativeDate, titleCase } from "@/lib/utils";
import { AppSelect } from "./app-select";
import { PageError, PageLoading } from "./page-states";
import { useWorkspace } from "./workspace-provider";

function ApprovalDecision({ approval, organizationId, contractId }: { approval: ApprovalRequest; organizationId: string; contractId: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Exclude<ApprovalStatus, "pending">>("approved");
  const [note, setNote] = useState("");
  const [results, setResults] = useState<Record<string, boolean>>({});
  const mutation = useMutation({
    mutationFn: () => api.decideApproval(organizationId, contractId, approval.id, { status, resolution_note: note, condition_results: results }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["approvals", organizationId, contractId] }),
  });
  if (approval.status !== "pending") return <div className="approval-resolution"><span className={`pill ${approval.status.includes("approved") ? "low" : approval.status === "rejected" ? "high" : "medium"}`}>{titleCase(approval.status)}</span><p>{approval.resolution_note}</p>{approval.resolved_by_name && <small>Decided by {approval.resolved_by_name} · {formatRelativeDate(approval.resolved_at)}</small>}</div>;
  return <div className="approval-decision">
    {approval.conditions.length > 0 && <fieldset><legend>Condition checks</legend>{approval.conditions.map((condition) => <label key={condition}><input type="checkbox" checked={Boolean(results[condition])} onChange={(event) => setResults({ ...results, [condition]: event.target.checked })} />{condition}</label>)}</fieldset>}
    <div className="approval-decision-row"><AppSelect value={status} ariaLabel="Approval decision" onValueChange={(value) => setStatus(value as Exclude<ApprovalStatus, "pending">)} options={[{ value: "approved", label: "Approve" }, { value: "conditionally_approved", label: "Approve conditionally" }, { value: "changes_requested", label: "Request changes" }, { value: "rejected", label: "Reject" }, { value: "cancelled", label: "Cancel request" }]} /><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason for this decision" /><button className="button secondary" disabled={note.trim().length < 5 || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Recording…" : "Record decision"}</button></div>
    {mutation.error && <p className="form-error">{mutation.error.message}</p>}
  </div>;
}

export function ContractCollaboration({ contractId }: { contractId: string }) {
  const { activeOrganization, canUpload, canManageTeam, user } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [decision, setDecision] = useState<ContractDecisionName>("change");
  const [decisionSubject, setDecisionSubject] = useState("Contract review");
  const [decisionRationale, setDecisionRationale] = useState("");
  const [approvalTitle, setApprovalTitle] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalAssignee, setApprovalAssignee] = useState("");
  const [conditions, setConditions] = useState("");
  const [shareLabel, setShareLabel] = useState("External reviewer");
  const [shareToken, setShareToken] = useState("");

  const commentsQuery = useQuery({ queryKey: ["comments", organizationId, contractId], queryFn: () => api.comments(organizationId, contractId), enabled: Boolean(organizationId) });
  const decisionsQuery = useQuery({ queryKey: ["decisions", organizationId, contractId], queryFn: () => api.decisions(organizationId, contractId), enabled: Boolean(organizationId) });
  const approvalsQuery = useQuery({ queryKey: ["approvals", organizationId, contractId], queryFn: () => api.approvals(organizationId, contractId), enabled: Boolean(organizationId) });
  const sharesQuery = useQuery({ queryKey: ["shares", organizationId, contractId], queryFn: () => api.shares(organizationId, contractId), enabled: Boolean(organizationId) && canManageTeam });
  const membersQuery = useQuery({ queryKey: ["members", organizationId], queryFn: () => api.members(organizationId), enabled: Boolean(organizationId) });

  const commentMutation = useMutation({ mutationFn: () => api.createComment(organizationId, contractId, { body: comment, mentioned_user_ids: mentions }), onSuccess: async () => { setComment(""); setMentions([]); await queryClient.invalidateQueries({ queryKey: ["comments", organizationId, contractId] }); } });
  const decisionMutation = useMutation({ mutationFn: () => api.createDecision(organizationId, contractId, { decision, subject: decisionSubject, rationale: decisionRationale }), onSuccess: async () => { setDecisionRationale(""); await queryClient.invalidateQueries({ queryKey: ["decisions", organizationId, contractId] }); } });
  const approvalMutation = useMutation({ mutationFn: () => api.createApproval(organizationId, contractId, { title: approvalTitle, note: approvalNote, assigned_to_user_id: approvalAssignee || null, conditions: conditions.split("\n").map((item) => item.trim()).filter(Boolean) }), onSuccess: async () => { setApprovalTitle(""); setApprovalNote(""); setConditions(""); await queryClient.invalidateQueries({ queryKey: ["approvals", organizationId, contractId] }); } });
  const shareMutation = useMutation({ mutationFn: () => api.createShare(organizationId, contractId, { label: shareLabel, include_evidence: true, expires_in_days: 7 }), onSuccess: async (created) => { setShareToken(created.token); await queryClient.invalidateQueries({ queryKey: ["shares", organizationId, contractId] }); } });
  const revokeMutation = useMutation({ mutationFn: (shareId: string) => api.revokeShare(organizationId, contractId, shareId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shares", organizationId, contractId] }) });

  const loading = commentsQuery.isLoading || decisionsQuery.isLoading || approvalsQuery.isLoading;
  const error = commentsQuery.error || decisionsQuery.error || approvalsQuery.error;
  if (loading) return <PageLoading rows={7} />;
  if (error) return <PageError error={error} />;

  return <section className="collaboration-workspace">
    <div className="content-heading"><div><p className="eyebrow">Human review record</p><h2>Collaborate and decide</h2></div><p>Discussion, decisions, approvals, and external access remain attributable and auditable.</p></div>
    <div className="collaboration-columns">
      <div className="collaboration-main">
        <section className="workflow-section"><header><div><AtSign size={17} /><h3>Comments and mentions</h3></div><span>{commentsQuery.data?.length ?? 0}</span></header>
          {canUpload && <form className="comment-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (comment.trim()) commentMutation.mutate(); }}><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add context, a question, or a handoff note…" /><div><div className="mention-picker">{(membersQuery.data ?? []).filter((member) => member.user_id !== user?.id).map((member) => <label key={member.user_id}><input type="checkbox" checked={mentions.includes(member.user_id)} onChange={(event) => setMentions(event.target.checked ? [...mentions, member.user_id] : mentions.filter((id) => id !== member.user_id))} />@{member.display_name || member.email}</label>)}</div><button className="button" disabled={comment.trim().length < 1 || commentMutation.isPending}><Send size={14} />Comment</button></div></form>}
          <div className="comment-stream">{commentsQuery.data?.length ? commentsQuery.data.map((item) => <article key={item.id}><div><strong>{item.author_name || item.author_email}</strong><time>{formatRelativeDate(item.created_at)}</time></div><p>{item.body}</p>{item.mentioned_user_ids.length > 0 && <small><AtSign size={11} />{item.mentioned_user_ids.length} mentioned</small>}</article>) : <div className="quiet-panel"><MessageSquareText size={18} /><p>No comments yet. Record context that should survive the meeting.</p></div>}</div>
        </section>

        <section className="workflow-section"><header><div><UserCheck size={17} /><h3>Review decisions</h3></div><span>{decisionsQuery.data?.length ?? 0}</span></header>
          {canUpload && <form className="decision-form" onSubmit={(event) => { event.preventDefault(); decisionMutation.mutate(); }}><AppSelect value={decision} ariaLabel="Review decision" onValueChange={(value) => setDecision(value as ContractDecisionName)} options={[{ value: "accept", label: "Accept" }, { value: "change", label: "Change" }, { value: "escalate", label: "Escalate" }, { value: "resolve", label: "Resolve" }]} /><input value={decisionSubject} onChange={(event) => setDecisionSubject(event.target.value)} placeholder="Decision subject" /><textarea value={decisionRationale} onChange={(event) => setDecisionRationale(event.target.value)} placeholder="Evidence and rationale" /><button className="button secondary" disabled={decisionRationale.trim().length < 5 || decisionMutation.isPending}>Record decision</button></form>}
          <div className="decision-stream">{[...(decisionsQuery.data ?? [])].reverse().map((item) => <article key={item.id}><span className={`decision-icon ${item.decision}`}>{item.decision === "accept" || item.decision === "resolve" ? <CheckCircle2 size={15} /> : item.decision === "escalate" ? <XCircle size={15} /> : <ShieldCheck size={15} />}</span><div><div><strong>{titleCase(item.decision)} · {item.subject}</strong><time>{formatRelativeDate(item.created_at)}</time></div><p>{item.rationale}</p><small>{item.reviewer_name || item.reviewer_email}</small></div></article>)}</div>
        </section>

        <section className="workflow-section"><header><div><ShieldCheck size={17} /><h3>Approval requests</h3></div><span>{approvalsQuery.data?.length ?? 0}</span></header>
          {canUpload && <form className="approval-form" onSubmit={(event) => { event.preventDefault(); approvalMutation.mutate(); }}><input value={approvalTitle} onChange={(event) => setApprovalTitle(event.target.value)} placeholder="What needs approval?" /><AppSelect value={approvalAssignee} ariaLabel="Approval assignee" onValueChange={setApprovalAssignee} options={[{ value: "", label: "Any owner or administrator" }, ...(membersQuery.data ?? []).map((member) => ({ value: member.user_id, label: member.display_name || member.email }))]} /><textarea value={conditions} onChange={(event) => setConditions(event.target.value)} placeholder={"Conditional approval rules, one per line\nExample: Liability cap reduced to 12 months’ fees"} /><textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Context for the approver" /><button className="button secondary" disabled={approvalTitle.trim().length < 2 || approvalMutation.isPending}>Request approval</button></form>}
          <div className="approval-list">{approvalsQuery.data?.map((item) => <article key={item.id}><div className="approval-title"><div><strong>{item.title}</strong><span>Requested by {item.requested_by_name} · {formatRelativeDate(item.created_at)}</span></div><span className={`pill ${item.status.includes("approved") ? "low" : item.status === "pending" ? "medium" : "high"}`}>{titleCase(item.status)}</span></div>{item.note && <p>{item.note}</p>}{item.assigned_to_name && <small>Assigned to {item.assigned_to_name}</small>}{item.conditions.length > 0 && <ul>{item.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>}<ApprovalDecision approval={item} organizationId={organizationId} contractId={contractId} /></article>)}</div>
        </section>
      </div>

      <aside className="collaboration-side">
        <section><p className="eyebrow">Professional handoff</p><h3>Prepare counsel</h3><p>Download a DOCX package with evidence, unresolved risks, decisions, actions, and approvals.</p><a className="button secondary" href={api.counselHandoffUrl(organizationId, contractId)} download><Download size={14} />Counsel handoff</a></section>
        {canManageTeam && <section><p className="eyebrow">Controlled access</p><h3>Secure external review</h3><p>Links expire automatically, can be revoked, and expose the review report without workspace access.</p><input value={shareLabel} onChange={(event) => setShareLabel(event.target.value)} aria-label="External share label" /><button className="button secondary" disabled={shareMutation.isPending || shareLabel.trim().length < 2} onClick={() => shareMutation.mutate()}><Link2 size={14} />Create 7-day link</button>{shareToken && <div className="share-token"><strong>Copy this link now</strong><code>{`${window.location.origin}/shared/${shareToken}`}</code></div>}<div className="share-list">{sharesQuery.data?.map((share) => <div key={share.id}><span><strong>{share.label}</strong><small>{share.revoked_at ? "Revoked" : `Expires ${formatDate(share.expires_at)} · ${share.view_count} views`}</small></span>{!share.revoked_at && <button onClick={() => revokeMutation.mutate(share.id)}>Revoke</button>}</div>)}</div></section>}
      </aside>
    </div>
  </section>;
}
