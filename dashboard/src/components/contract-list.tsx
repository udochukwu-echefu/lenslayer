"use client";

import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import type { Contract } from "@/lib/types";
import { formatRelativeDate, titleCase } from "@/lib/utils";

export function ContractList({ contracts, limit }: { contracts: Contract[]; limit?: number }) {
  const rows = limit ? contracts.slice(0, limit) : contracts;
  return (
    <div className="contract-list panel">
      {rows.map((contract) => (
        <Link className="data-row contract-row" href={`/contracts/${contract.id}`} key={contract.id}>
          <span className="contract-file"><FileText size={17} /></span>
          <span className="contract-primary"><span className="row-title">{contract.title || contract.source_name}</span><span className="row-meta">{contract.counterparty || "Counterparty not identified"}</span></span>
          <span className="contract-type">{contract.contract_type || "Unknown"}</span>
          <span className={`status ${contract.status}`}>{titleCase(contract.status)}</span>
          <span className="contract-updated">{formatRelativeDate(contract.updated_at)}</span>
          <ArrowUpRight className="contract-arrow" size={15} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}
