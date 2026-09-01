import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SignInButton } from "@/components/sign-in-button";
import { oidcConfigured, safeCallbackUrl } from "@/lib/auth";

const messages: Record<string, string> = {
  AccessDenied: "Auth0 did not grant access. If your account is new, verify your email address and try again.",
  OAuthCallback: "The Auth0 response could not be verified.",
  OAuthSignin: "LensLayer could not start the Auth0 sign-in flow.",
  Configuration: "Authentication is not configured correctly for this deployment.",
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string | string[]; callbackUrl?: string | string[] }> }) {
  const params = await searchParams;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  return <main className="auth-page"><section className="auth-card auth-entry"><BrandMark /><div className="auth-state-icon danger"><AlertTriangle size={20} /></div><div><p className="eyebrow">Sign-in interrupted</p><h1>We could not sign you in.</h1><p>{messages[error ?? ""] ?? "The authentication request did not complete. Try again or contact your workspace administrator."}</p></div><SignInButton callbackUrl={callbackUrl} configured={oidcConfigured} /><p className="auth-switch"><Link href="/">Return to LensLayer</Link></p></section></main>;
}
