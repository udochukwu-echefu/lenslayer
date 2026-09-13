"use client";

import dynamic from "next/dynamic";
import { PageLoading } from "./page-states";

const ContractDetail = dynamic(
  () => import("./contract-detail").then((module) => module.ContractDetail),
  {
    ssr: false,
    loading: () => <div className="page"><PageLoading rows={8} /></div>,
  },
);

export function ContractDetailLoader({ contractId }: { contractId: string }) {
  return <ContractDetail contractId={contractId} />;
}
