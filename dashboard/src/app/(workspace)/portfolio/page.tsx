"use client";

import { ArrowUpRight, Search, Send } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { ContractList } from "@/components/contract-list";
import { PageError, PageLoading } from "@/components/page-states";
import { TableCard } from "@/components/ui/table-card";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { useContractPage, useDebouncedValue, useWorkspaceOverview } from "@/lib/workspace-query-hooks";
import { useQuestionStream } from "@/lib/use-question-stream";

export default function PortfolioPage() {
  const { activeOrganization, isDemo } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const q = useDebouncedValue(search.trim());
  const contractsQuery = useContractPage(organizationId, { q, status: sourceFilter === "all" ? undefined : sourceFilter });
  const overview = useWorkspaceOverview(organizationId);
  const questionMutation = useQuestionStream<Awaited<ReturnType<typeof api.askPortfolio>>>(`/organizations/${organizationId}/portfolio/questions`, isDemo);
  const contracts = contractsQuery.data?.items ?? [];
  const hasContracts = Boolean(overview.data?.counts.contracts);
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
      {questionMutation.isPending && <button className="button secondary" type="button" onClick={questionMutation.cancel}>Stop answer</button>}
      {questionMutation.partial && !questionMutation.data && <div className="portfolio-answer" role="status"><strong>Provisional answer, not complete</strong><p>{questionMutation.partial}</p></div>}
      {questionMutation.data && <div className="portfolio-answer"><div><span>{questionMutation.data.generated_by === "model" ? "Evidence-grounded answer" : "Retrieved evidence"}</span><p>{questionMutation.data.answer}</p></div><div className="portfolio-sources">{questionMutation.data.sources.map((source, index) => <Link href={`/contracts/${source.contract_id}?tab=ask`} key={`${source.contract_id}-${index}`}><span>{source.contract_title}<ArrowUpRight size={13} /></span><small>{source.location}</small><p>{source.excerpt}</p></Link>)}</div></div>}
    </section>

    <TableCard className="portfolio-register" title="Contract register" description={`${contractsQuery.data?.total ?? "—"} visible sources`} actions={<div className="portfolio-register-tools"><label className="portfolio-search"><Search size={16} /><input id="portfolio-contract-filter" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Search contracts" /></label><AppSelect className="portfolio-source-select" value={sourceFilter} ariaLabel="Filter portfolio sources by status" onValueChange={setSourceFilter} options={[{ value: "all", label: "All source states" }, { value: "reviewed", label: "Reviewed" }, { value: "ready", label: "Ready" }, { value: "processing", label: "Processing" }, { value: "failed", label: "Failed" }]} /></div>}>
      {contractsQuery.isLoading ? <PageLoading rows={6} /> : contractsQuery.error ? <PageError error={contractsQuery.error} /> : <ContractList contracts={contracts} paging={{ total: contractsQuery.data?.total ?? 0, offset: contractsQuery.offset, limit: 25, onOffsetChange: contractsQuery.setOffset, sort: contractsQuery.sort, onSortChange: contractsQuery.setSort }} />}
    </TableCard>
  </div>;
}
