import { Clock3 } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { SignInButton } from "@/components/sign-in-button";
import { oidcConfigured, safeCallbackUrl } from "@/lib/auth";

export default async function SessionExpiredPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  return <main className="auth-page"><section className="auth-card auth-entry"><BrandMark /><div className="auth-state-icon"><Clock3 size={20} /></div><div><p className="eyebrow">Session expired</p><h1>Sign in to continue.</h1><p>Your session could not be refreshed. Your workspace data is unchanged.</p></div><SignInButton callbackUrl={callbackUrl} configured={oidcConfigured} /></section></main>;
}
