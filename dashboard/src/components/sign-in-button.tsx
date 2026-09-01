"use client";

import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { isPublicAccessEnabled } from "@/lib/api";

type SignInMethod = "auth0" | "email" | "google";

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.703-1.568 2.684-3.878 2.684-6.614Z"/><path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.91-2.258c-.805.54-1.835.859-3.046.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.442 1.346l2.58-2.58C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"/></svg>;
}

export function SignInButton({ callbackUrl, configured, mode = "signin", method = "auth0" }: { callbackUrl: string; configured: boolean; mode?: "signin" | "signup"; method?: SignInMethod }) {
  const [pending, setPending] = useState(false);
  if (!configured && isPublicAccessEnabled()) return <a className="button secondary" href={callbackUrl}>Open the demo workspace<ArrowRight size={16} /></a>;
  if (!configured) return <div className="auth-config-error" role="alert"><strong>Authentication is unavailable</strong><span>This deployment is missing its Auth0 configuration. Contact the workspace administrator.</span></div>;
  const isGoogle = method === "google";
  const isEmail = method === "email";
  const label = isGoogle ? "Continue with Google" : isEmail ? (mode === "signup" ? "Sign up with email" : "Continue with email") : (mode === "signup" ? "Create account with Auth0" : "Continue with Auth0");
  const pendingLabel = isGoogle ? "Opening Google..." : "Opening secure sign-in...";
  const authorizationParams = { ...(mode === "signup" ? { screen_hint: "signup" } : {}), ...(isGoogle ? { connection: "google-oauth2" } : {}) };
  return <button className={`button signin-button${isGoogle ? " auth-google-button" : isEmail ? " auth-email-button" : ""}`} type="button" disabled={pending} onClick={() => { setPending(true); void signIn("oidc", { callbackUrl }, Object.keys(authorizationParams).length ? authorizationParams : undefined); }}>{isGoogle ? <GoogleMark /> : isEmail ? <Mail size={17} /> : <KeyRound size={16} />}{pending ? pendingLabel : label}{!isGoogle && <ArrowRight size={16} />}</button>;
}
