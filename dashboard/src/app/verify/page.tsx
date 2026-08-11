"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, Plus, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { titleCase } from "@/lib/utils";
import { verificationStatusLabel, verificationTone } from "@/lib/verification";

type QueueScope = "all" | "pending" | "decided";

export default function VerifyPage() {
  const { activeOrganization, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<QueueScope>("all");
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["verification-cases", organizationId], queryFn: () => api.verificationCases(organizationId), enabled: Boolean(organizationId) });
  const bootstrap = useMutation({
    mutationFn: () => api.bootstrapVerificationCases(organizationId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["verification-cases", organizationId] }),
  });
  const cases = useMemo(() => query.data ?? [], [query.data]);
  const awaitingDecision = useMemo(() => cases.filter((item) => item.latest_decision === null), [cases]);
  const visible = useMemo(() => cases.filter((item) => {
    const matchesScope = scope === "all" || (scope === "pending" ? item.latest_decision === null : item.latest_decision !== null);
    const term = search.trim().toLowerCase();
    return matchesScope && (!term || item.applicant_name.toLowerCase().includes(term) || item.reference.toLowerCase().includes(term));
  }), [cases, scope, search]);

  return <div className="page verify-page">
    <div className="page-heading"><div><h1 className="page-title">Identity verification</h1><p className="page-description">A separate governance module for reconciling onboarding evidence and recording attributable decisions.</p></div>{canUpload && <Link className="button" href="/verify/new"><Plus size={16} />New case</Link>}</div>

    <div className="verify-notice" role="note"><FlaskConical size={17} /><div><strong>Synthetic demonstration cases</strong><p>These fictional records are isolated from private onboarding evidence.</p></div></div>

    {query.isLoading ? <PageLoading rows={7} /> : query.error ? <PageError error={query.error} /> : !cases.length ? <section className="verify-empty panel"><span><ShieldCheck size={22} /></span><h2>Open the demonstration queue</h2><p>Load three fictional cases that cover low-risk variation, expired identity evidence, address conflict, and material identity mismatch.</p>{canUpload ? <button className="button" type="button" disabled={bootstrap.isPending} onClick={() => bootstrap.mutate()}>{bootstrap.isPending ? "Preparing cases…" : "Load synthetic cases"}<ArrowRight size={16} /></button> : <small>An owner, administrator, or reviewer must load the demonstration cases.</small>}{bootstrap.error && <p className="form-error" role="alert">{bootstrap.error.message}</p>}</section> : <>
      <section className="verify-register">
        <div className="verify-register-tools"><div className="task-tabs" role="tablist" aria-label="Verification case views">{(["all", "pending", "decided"] as QueueScope[]).map((item) => <button key={item} type="button" role="tab" aria-selected={scope === item} onClick={() => setScope(item)}>{item === "all" ? `All cases (${cases.length})` : item === "pending" ? `Awaiting decision (${awaitingDecision.length})` : `Decided (${cases.length - awaitingDecision.length})`}</button>)}</div><label className="verify-search"><Search size={15} /><span className="sr-only">Search verification cases</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search applicant or case" /></label></div>
        <div className="verify-queue-head" aria-hidden="true"><span>Applicant</span><span>Risk</span><span>Owner</span><span>Recommendation</span><span>Status</span><span /></div>
        <div className="verify-queue">{visible.map((item) => <Link className="verify-case-row" href={`/verify/${item.id}`} key={item.id}><div className="verify-applicant"><strong>{item.applicant_name}</strong><span>{item.reference} · {item.synthetic ? "Synthetic" : titleCase(item.intake_channel)} · {titleCase(item.priority)}</span></div><div className={`verify-score ${item.risk_score >= 70 ? "high" : item.risk_score >= 20 ? "medium" : "low"}`}><strong>{item.risk_score}</strong><span>/100</span></div><span className="verify-flags">{item.assigned_to_name || "Unassigned"}</span><span className={`pill ${verificationTone(item.suggested_action)}`}>{item.suggested_action}</span><span className={`verify-case-status ${item.status}`}>{verificationStatusLabel(item.status)}</span><ArrowRight className="verify-row-arrow" size={16} /></Link>)}</div>
        {!visible.length && <div className="task-empty"><Search size={16} /><p>No verification cases match this view.</p></div>}
      </section>
    </>}
  </div>;
}
