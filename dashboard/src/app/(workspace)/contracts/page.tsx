"use client";

import { Filter, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { ContractList } from "@/components/contract-list";
import { EmptyContracts, PageError, PageLoading } from "@/components/page-states";
import { TableCard } from "@/components/ui/table-card";
import { useWorkspace } from "@/components/workspace-provider";
import { useContractPage, useDebouncedValue } from "@/lib/workspace-query-hooks";

function ContractsContent() {
  const params = useSearchParams();
  const { activeOrganization, canUpload } = useWorkspace();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const q = useDebouncedValue(search.trim());
  const query = useContractPage(activeOrganization?.id ?? "", { q, status: status === "all" ? undefined : status });
  const filtered = query.data?.items ?? [];
  return <div className="page"><div className="page-heading"><div><h1 className="page-title">Contracts</h1><p className="page-description">Agreement records, processing status, and evidence-backed reviews.</p></div>{canUpload && <Link href="/contracts/new" className="button"><Plus size={16} />New contract</Link>}</div>
    <TableCard title="Contract register" actions={<div className="table-tools"><label className="search-field"><Search size={16} /><input id="contract-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contracts" aria-label="Filter contract register" /></label><div className="filter-field"><Filter size={15} /><AppSelect ariaLabel="Filter by status" value={status} onValueChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "reviewed", label: "Reviewed" }, { value: "ready", label: "Ready for decision" }, { value: "processing", label: "Processing" }, { value: "queued", label: "Queued" }, { value: "failed", label: "Failed" }]} /></div></div>}>
      {query.isLoading ? <PageLoading rows={8} /> : query.error ? <PageError error={query.error} /> : !query.data?.total && !q && status === "all" ? <EmptyContracts canCreate={canUpload} /> : <><ContractList contracts={filtered} paging={{ total: query.data?.total ?? 0, offset: query.offset, limit: 25, onOffsetChange: query.setOffset, sort: query.sort, onSortChange: query.setSort }} />{!filtered.length && <div className="empty"><div><h2>No matching contracts</h2><p>Try another search term or broaden the status filter.</p><button className="button secondary" onClick={() => { setSearch(""); setStatus("all"); query.setOffset(0); }}>Clear filters</button></div></div>}</>}
    </TableCard>
  </div>;
}

export default function ContractsPage() {
  return <Suspense fallback={<div className="page"><PageLoading rows={8} /></div>}><ContractsContent /></Suspense>;
}
