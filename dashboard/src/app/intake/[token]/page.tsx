import { SecureIntakeUpload } from "@/components/secure-intake-upload";

export default async function SecureIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SecureIntakeUpload token={token} />;
}
