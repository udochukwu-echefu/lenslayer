"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { PageError, PageLoading } from "@/components/page-states";
import { api } from "@/lib/api";
import { asText, formatDate, severity, titleCase } from "@/lib/utils";

export default function SharedReviewPage() {
  const { token } = useParams<{ token: string }>();
  const query = useQuery({ queryKey: ["shared-review", token], queryFn: () => api.sharedContract(token), enabled: Boolean(token), retry: false });
  if (query.isLoading) return <main className="shared-review"><header><BrandMark /></header><PageLoading rows={8} /></main>;
  if (query.error) return <main className="shared-review"><header><BrandMark /></header><PageError error={query.error} /></main>;
  if (!query.data) return null;
  const review = query.data;
  return <main className="shared-review">
    <header><BrandMark /><span><ShieldCheck size={14} />Secure read-only review</span></header>
    <section className="shared-hero"><div><p className="eyebrow">Shared for {review.shared_for}</p><h1>{review.contract_title}</h1><p>{review.counterparty || "Counterparty not identified"} · {review.contract_type || "Contract"}</p></div><div><span>Attention</span><strong>{review.overall_attention || "Review"}</strong><small>Access expires {formatDate(review.expires_at)}</small></div></section>
    <section className="shared-summary"><p className="eyebrow">Executive summary</p><h2>{review.executive_summary}</h2><p><AlertTriangle size={15} />First-pass analysis for human review. This is not legal advice.</p></section>
    <section className="shared-section"><div className="content-heading"><div><p className="eyebrow">Evidence-linked findings</p><h2>Priority risks</h2></div><p>{review.risks.length} findings shared</p></div><div className="shared-findings">{review.risks.map((risk, index) => <article key={`${risk.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><div><h3>{asText(risk.title, "Clause finding")}</h3><span className={`pill ${severity(risk.risk_level)}`}>{titleCase(risk.risk_level || "review")}</span></div>{risk.explanation && <p>{risk.explanation}</p>}{(risk.evidence || risk.excerpt || risk.quote) && <blockquote>{risk.evidence || risk.excerpt || risk.quote}</blockquote>}{risk.recommendation && <small><strong>Suggested next step:</strong> {risk.recommendation}</small>}</div></article>)}</div></section>
    <section className="shared-two-column"><div><p className="eyebrow">Possible gaps</p><h2>Protections to verify</h2>{review.missing_protections.length ? review.missing_protections.map((item, index) => <p key={index}>{asText(typeof item === "string" ? item : item.issue ?? item.title)}</p>) : <div className="quiet-panel"><CheckCircle2 size={17} /><p>No possible gaps were included.</p></div>}</div><div><p className="eyebrow">Negotiation</p><h2>Priority asks</h2>{review.negotiation_priorities.length ? review.negotiation_priorities.map((item, index) => <p key={index}>{asText(typeof item === "string" ? item : item.priority ?? item.title)}</p>) : <div className="quiet-panel"><FileText size={17} /><p>No negotiation priorities were included.</p></div>}</div></section>
    <footer>Shared securely by Lenslayer · Evidence before conclusion</footer>
  </main>;
}
