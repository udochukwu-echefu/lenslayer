import { VerificationDetail } from "@/components/verification-detail";

export default async function VerificationCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <VerificationDetail caseId={caseId} />;
}
