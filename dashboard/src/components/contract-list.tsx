"use client";

import { EllipsisVertical, FileText } from "lucide-react";
import Link from "next/link";
import type { Contract } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";
import { DataTable, type DataColumn } from "./ui/data-table";
import { StatusBadge } from "./ui/status-badge";
import type { ContractFilters } from "@/lib/api/workspace-queries";
import { QueryPagination } from "./ui/query-pagination";

const columns: DataColumn<Contract>[] = [
  {
    id: "agreement", header: "Agreement", primary: true, className: "contract-col-agreement",
    sortValue: (contract) => contract.title || contract.source_name,
    cell: (contract) => <span className="table-contract-title"><span className="contract-file"><FileText size={17} /></span><span><strong title={contract.title || contract.source_name}>{contract.title || contract.source_name}</strong><small title={contract.counterparty || "Counterparty not identified"}>{contract.counterparty || "Counterparty not identified"}</small></span></span>,
  },
  { id: "type", header: "Type", className: "contract-col-type", sortValue: (contract) => contract.contract_type, cell: (contract) => contract.contract_type || "Unknown" },
  { id: "status", header: "Status", className: "contract-col-status", sortValue: (contract) => contract.status, cell: (contract) => <StatusBadge status={contract.status} /> },
  { id: "updated", header: "Updated", className: "contract-col-updated", sortValue: (contract) => new Date(contract.updated_at).getTime(), cell: (contract) => <time dateTime={contract.updated_at}>{formatRelativeDate(contract.updated_at)}</time> },
  { id: "open", header: "Action", mobileLabel: "Open", className: "table-action-cell", cell: (contract) => <Link className="table-row-action" href={`/contracts/${contract.id}`} aria-label={`Open ${contract.title || contract.source_name}`}><EllipsisVertical size={18} /></Link> },
];

export type ContractPaging = { total: number; offset: number; limit: number; onOffsetChange: (offset: number) => void; sort: { sort: NonNullable<ContractFilters["sort"]>; descending: boolean }; onSortChange: (sort: { sort: NonNullable<ContractFilters["sort"]>; descending: boolean }) => void };
export function ContractList({ contracts, limit, showFooter = false, paging }: { contracts: Contract[]; limit?: number; showFooter?: boolean; paging?: ContractPaging }) {
  const rows = limit ? contracts.slice(0, limit) : contracts;
  const sortFields = { agreement: "title", type: "contract_type", status: "status", updated: "updated_at" } as const;
  return <><DataTable ariaLabel="Contract register" columns={columns} rows={rows} rowKey={(contract) => contract.id} rowHref={(contract) => `/contracts/${contract.id}`} empty={<p className="quiet-empty">No contracts in this view.</p>} showFooter={showFooter && !paging} serverSort={paging ? { id: Object.entries(sortFields).find(([, value]) => value === paging.sort.sort)?.[0] ?? "updated", direction: paging.sort.descending ? "descending" : "ascending", onChange: (id, descending) => paging.onSortChange({ sort: sortFields[id as keyof typeof sortFields], descending }) } : undefined} />{paging && <QueryPagination {...paging} label="Contract register" />}</>;
}
