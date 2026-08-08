import type { Metadata } from "next";
import { ContractDetail } from "@/components/contract-detail";

export const metadata: Metadata = { title: "Contract review" };

export default async function ContractPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  return <ContractDetail contractId={contractId} />;
}
