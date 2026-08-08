"use client";

import { ArrowRight, KeyRound } from "lucide-react";
import { signIn } from "next-auth/react";

export function SignInButton({ callbackUrl, configured }: { callbackUrl: string; configured: boolean }) {
  if (!configured) return <a className="button secondary" href={callbackUrl}>Continue in local development<ArrowRight size={16} /></a>;
  return <button className="button signin-button" type="button" onClick={() => signIn("oidc", { callbackUrl })}><KeyRound size={16} />Continue with SSO<ArrowRight size={16} /></button>;
}
