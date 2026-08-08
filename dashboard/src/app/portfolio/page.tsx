"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, FileSearch, Search, Send } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/utils";

export default function PortfolioPage() {
  const { activeOrganization } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const contractsQuery = useQuery({ queryKey: ["contracts", organizationId], queryFn: () => api.contracts(organizationId), enabled: Boolean(organizationId) });
  const questionMutation = useMutation({ mutationFn: (value: string) => api.askPortfolio(organizationId, value) });
  const contracts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contractsQuery.data ?? [];
    return (contractsQuery.data ?? []).filter((contract) => [contract.title, contract.source_name, contract.counterparty, contract.contract_type, contract.status].some((value) => value?.toLowerCase().includes(query)));
  }, [contractsQuery.data, search]);

  return <div className="page portfolio-page">
    <div className="page-heading"><div><p className="eyebrow">Portfolio intelligence</p><h1 className="page-title">Ask across every agreement</h1><p className="page-description">Find contracts by metadata, then retrieve evidence across retained agreement text without opening files one by one.</p></div></div>
    <section className="portfolio-question panel">
      <div><p className="eyebrow">Cross-contract question</p><h2>Trace an issue across the portfolio</h2><p>Answers cite the contracts and excerpts used. No source means no supported answer.</p></div>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); if (question.trim().length >= 3) questionMutation.mutate(question.trim()); }}>
        <FileSearch size={20} />
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Which contracts renew automatically, and what notice do we need to give?" aria-label="Portfolio question" />
        <button className="button" disabled={question.trim().length < 3 || questionMutation.isPending}>{questionMutation.isPending ? "Searching…" : <><Send size={14} />Ask portfolio</>}</button>
      </form>
      {questionMutation.error && <p className="form-error">{questionMutation.error.message}</p>}
      {questionMutation.data && <div className="portfolio-answer"><div><span>{questionMutation.data.generated_by === "model" ? "Evidence-grounded answer" : "Retrieved evidence"}</span><p>{questionMutation.data.answer}</p></div><div className="portfolio-sources">{questionMutation.data.sources.map((source, index) => <Link href={`/contracts/${source.contract_id}?tab=ask`} key={`${source.contract_id}-${index}`}><span>{source.contract_title}<ArrowUpRight size={13} /></span><small>{source.location}</small><p>{source.excerpt}</p></Link>)}</div></div>}
    </section>

    <section className="portfolio-register">
      <div className="section-heading"><div><h2>Contract register</h2><p>{contracts.length} visible</p></div><label className="portfolio-search"><Search size={16} /><input id="contract-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, counterparty, type, or status" /></label></div>
      {contractsQuery.isLoading ? <PageLoading rows={6} /> : contractsQuery.error ? <PageError error={contractsQuery.error} /> : <div className="portfolio-table">{contracts.map((contract) => <Link href={`/contracts/${contract.id}`} key={contract.id}><div><strong>{contract.title || contract.source_name}</strong><span>{contract.counterparty || "Counterparty not identified"}</span></div><span>{contract.contract_type || "Contract"}</span><span className={`status ${contract.status}`}>{titleCase(contract.status)}</span><time>{formatDate(contract.created_at)}</time><ArrowUpRight size={15} /></Link>)}</div>}
    </section>
  </div>;
}
