"use client";

import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import type { Contract } from "@/lib/types";
import { formatRelativeDate } from "@/lib/utils";
import { DataTable, type DataColumn } from "./ui/data-table";
import { StatusBadge } from "./ui/status-badge";

const columns: DataColumn<Contract>[] = [
  {
    id: "agreement", header: "Agreement", primary: true,
    sortValue: (contract) => contract.title || contract.source_name,
    cell: (contract) => <span className="table-contract-title"><span className="contract-file"><FileText size={17} /></span><span><strong title={contract.title || contract.source_name}>{contract.title || contract.source_name}</strong><small title={contract.counterparty || "Counterparty not identified"}>{contract.counterparty || "Counterparty not identified"}</small></span></span>,
  },
  { id: "type", header: "Type", sortValue: (contract) => contract.contract_type, cell: (contract) => contract.contract_type || "Unknown" },
  { id: "status", header: "Status", sortValue: (contract) => contract.status, cell: (contract) => <StatusBadge status={contract.status} /> },
  { id: "updated", header: "Updated", sortValue: (contract) => new Date(contract.updated_at).getTime(), cell: (contract) => <time dateTime={contract.updated_at}>{formatRelativeDate(contract.updated_at)}</time> },
  { id: "open", header: "", mobileLabel: "Open", className: "table-action-cell", cell: (contract) => <Link className="table-row-action" href={`/contracts/${contract.id}`} aria-label={`Open ${contract.title || contract.source_name}`}><ArrowUpRight size={17} /></Link> },
];

export function ContractList({ contracts, limit }: { contracts: Contract[]; limit?: number }) {
  const rows = limit ? contracts.slice(0, limit) : contracts;
  return <DataTable ariaLabel="Contract register" columns={columns} rows={rows} rowKey={(contract) => contract.id} rowHref={(contract) => `/contracts/${contract.id}`} empty={<p className="quiet-empty">No contracts in this view.</p>} />;
}
