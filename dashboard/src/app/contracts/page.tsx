"use client";

import { useQuery } from "@tanstack/react-query";
import { Filter, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { ContractList } from "@/components/contract-list";
import { EmptyContracts, PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";

function ContractsContent() {
  const params = useSearchParams();
  const { activeOrganization, canUpload } = useWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const query = useQuery({ queryKey: ["contracts", activeOrganization?.id], queryFn: () => api.contracts(activeOrganization!.id), enabled: Boolean(activeOrganization) });
  const filtered = useMemo(() => (query.data ?? []).filter((contract) => {
    const matchesStatus = status === "all" || contract.status === status;
    const haystack = `${contract.title} ${contract.source_name} ${contract.counterparty} ${contract.contract_type}`.toLowerCase();
    return matchesStatus && haystack.includes(search.toLowerCase());
  }), [query.data, search, status]);
  return <div className="page"><div className="page-heading"><div><h1 className="page-title">Contracts</h1><p className="page-description">Agreement records, processing status, and evidence-backed reviews.</p></div>{canUpload && <Link href="/contracts/new" className="button"><Plus size={16} />New contract</Link>}</div>
    <div className="table-tools"><label className="search-field"><Search size={16} /><input id="contract-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter this register by title, party, or type" aria-label="Filter contract register" /></label><div className="filter-field"><Filter size={15} /><AppSelect ariaLabel="Filter by status" value={status} onValueChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "reviewed", label: "Reviewed" }, { value: "ready", label: "Ready for decision" }, { value: "processing", label: "Processing" }, { value: "queued", label: "Queued" }, { value: "failed", label: "Failed" }]} /></div><span className="result-count">{filtered.length} {filtered.length === 1 ? "contract" : "contracts"}</span></div>
    {query.isLoading ? <PageLoading rows={8} /> : query.error ? <PageError error={query.error} /> : !query.data?.length ? <EmptyContracts canCreate={canUpload} /> : filtered.length ? <ContractList contracts={filtered} /> : <div className="empty panel"><div><h2>No matching contracts</h2><p>Try another search term or broaden the status filter.</p><button className="button secondary" onClick={() => { setSearch(""); setStatus("all"); }}>Clear filters</button></div></div>}
  </div>;
}

export default function ContractsPage() {
  return <Suspense fallback={<div className="page"><PageLoading rows={8} /></div>}><ContractsContent /></Suspense>;
}
