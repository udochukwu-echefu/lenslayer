import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AuthEntry } from "@/components/auth-entry";
import { authOptions, oidcConfigured, safeCallbackUrl } from "@/lib/auth";
import { wakePlatformApi } from "@/lib/platform-wake.server";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  const session = await getServerSession(authOptions);
  if (session && !session.error) redirect(callbackUrl);
  wakePlatformApi();
  return <AuthEntry callbackUrl={callbackUrl} configured={oidcConfigured} mode="signin" />;
}
