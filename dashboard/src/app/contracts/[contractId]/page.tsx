import type { Metadata } from "next";
import { ContractDetailLoader } from "@/components/contract-detail-loader";

export const metadata: Metadata = { title: "Contract review" };

export default async function ContractPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  return <ContractDetailLoader contractId={contractId} />;
}
