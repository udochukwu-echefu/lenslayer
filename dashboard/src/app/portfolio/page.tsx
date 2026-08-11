"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search, Send } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/utils";

export default function PortfolioPage() {
  const { activeOrganization } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const contractsQuery = useQuery({ queryKey: ["contracts", organizationId], queryFn: () => api.contracts(organizationId), enabled: Boolean(organizationId) });
  const questionMutation = useMutation({ mutationFn: (value: string) => api.askPortfolio(organizationId, value) });
  const contracts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contractsQuery.data ?? [];
    return (contractsQuery.data ?? []).filter((contract) => (sourceFilter === "all" || contract.status === sourceFilter) && (!query || [contract.title, contract.source_name, contract.counterparty, contract.contract_type, contract.status].some((value) => value?.toLowerCase().includes(query))));
  }, [contractsQuery.data, search, sourceFilter]);
  const hasContracts = Boolean(contractsQuery.data?.length);
  const suggestions = ["Which agreements renew automatically?", "Where are liability caps missing or unclear?", "Which notice deadlines fall in the next 60 days?"];

  return <div className="page portfolio-page">
    <div className="page-heading"><div><h1 className="page-title">Portfolio search</h1><p className="page-description">Ask a question across retained agreements and inspect the excerpts supporting each claim.</p></div></div>
    <section className="portfolio-question">
      <h2>Ask a portfolio question</h2>
      <form onSubmit={(event: FormEvent) => { event.preventDefault(); if (hasContracts && question.trim().length >= 3) questionMutation.mutate(question.trim()); }}>
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={hasContracts ? "Which contracts renew automatically, and what notice do we need to give?" : "Add or select contracts before asking a portfolio question."} aria-label="Portfolio question" disabled={!hasContracts} />
        <button className="button" disabled={!hasContracts || question.trim().length < 3 || questionMutation.isPending}>{questionMutation.isPending ? "Searching…" : <><Send size={14} />Ask portfolio</>}</button>
      </form>
      {!hasContracts && <p className="field-help">Add or select contracts before asking a portfolio question.</p>}
      {hasContracts && <div className="suggested-questions" aria-label="Suggested portfolio questions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div>}
      {questionMutation.error && <p className="form-error">{questionMutation.error.message}</p>}
      {questionMutation.data && <div className="portfolio-answer"><div><span>{questionMutation.data.generated_by === "model" ? "Evidence-grounded answer" : "Retrieved evidence"}</span><p>{questionMutation.data.answer}</p></div><div className="portfolio-sources">{questionMutation.data.sources.map((source, index) => <Link href={`/contracts/${source.contract_id}?tab=ask`} key={`${source.contract_id}-${index}`}><span>{source.contract_title}<ArrowUpRight size={13} /></span><small>{source.location}</small><p>{source.excerpt}</p></Link>)}</div></div>}
    </section>

    <section className="portfolio-register">
      <div className="section-heading"><div><h2>Contract register</h2><p>{contracts.length} visible sources</p></div><div className="portfolio-register-tools"><label className="portfolio-search"><Search size={16} /><input id="portfolio-contract-filter" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter source contracts" /></label><AppSelect className="portfolio-source-select" value={sourceFilter} ariaLabel="Filter portfolio sources by status" onValueChange={setSourceFilter} options={[{ value: "all", label: "All source states" }, { value: "reviewed", label: "Reviewed" }, { value: "ready", label: "Ready" }, { value: "processing", label: "Processing" }, { value: "failed", label: "Failed" }]} /></div></div>
      {contractsQuery.isLoading ? <PageLoading rows={6} /> : contractsQuery.error ? <PageError error={contractsQuery.error} /> : <div className="portfolio-table">{contracts.map((contract) => <Link href={`/contracts/${contract.id}`} key={contract.id}><div><strong>{contract.title || contract.source_name}</strong><span>{contract.counterparty || "Counterparty not identified"}</span></div><span>{contract.contract_type || "Contract"}</span><span className={`status ${contract.status}`}>{titleCase(contract.status)}</span><time>{formatDate(contract.created_at)}</time><ArrowUpRight size={15} /></Link>)}</div>}
    </section>
  </div>;
}
