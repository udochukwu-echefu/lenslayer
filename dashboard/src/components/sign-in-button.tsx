"use client";

import { ArrowRight, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { isPublicAccessEnabled } from "@/lib/api";
import styles from "./auth-surface.module.css";

type SignInMethod = "auth0" | "email" | "google";

function GoogleMark() {
  return <svg className="google-mark" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.703-1.568 2.684-3.878 2.684-6.614Z"/><path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.91-2.258c-.805.54-1.835.859-3.046.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"/><path fill="#FBBC05" d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.706V4.962H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.038l3.007-2.332Z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.442 1.346l2.58-2.58C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.962l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"/></svg>;
}

export function SignInButton({ callbackUrl, configured, mode = "signin", method = "auth0", emailConnection = "Username-Password-Authentication", label: customLabel, appearance = "default" }: { callbackUrl: string; configured: boolean; mode?: "signin" | "signup"; method?: SignInMethod; emailConnection?: string; label?: string; appearance?: "default" | "rounded" }) {
  const [pending, setPending] = useState(false);
  const [signInError, setSignInError] = useState("");
  const rounded = appearance === "rounded";
  if (!configured && isPublicAccessEnabled()) {
    const demoLink = <a className={`button secondary${rounded ? ` ${styles.control}` : ""}`} href={callbackUrl}>Open the demo workspace<ArrowRight size={16} aria-hidden="true" /></a>;
    return rounded ? <div className={styles.action}>{demoLink}</div> : demoLink;
  }
  if (!configured) return <div className={rounded ? styles.configError : "auth-config-error"} role="alert"><strong>Authentication is unavailable</strong><span>This deployment is missing its Auth0 configuration. Contact the workspace administrator.</span></div>;
  const isGoogle = method === "google";
  const isEmail = method === "email";
  const label = isGoogle ? "Continue with Google" : isEmail ? (mode === "signup" ? "Sign up with email and password" : "Sign in with email and password") : (mode === "signup" ? "Create account with Auth0" : "Continue with Auth0");
  const pendingLabel = isGoogle ? "Opening Google..." : "Opening secure sign-in...";
  const authorizationParams = { ...(mode === "signup" ? { screen_hint: "signup" } : {}), ...(isGoogle ? { connection: "google-oauth2" } : isEmail ? { connection: emailConnection } : {}) };
  async function startSignIn() {
    setPending(true);
    setSignInError("");
    try {
      const result = await signIn("oidc", { callbackUrl }, Object.keys(authorizationParams).length ? authorizationParams : undefined);
      if (result?.error) setSignInError("Secure sign-in could not be opened. Please try again.");
    } catch {
      setSignInError("Secure sign-in could not be opened. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={rounded ? styles.action : "auth-signin-action"}>
      <button className={`button signin-button${isGoogle ? " auth-google-button" : isEmail ? " auth-email-button" : ""}${rounded ? ` ${styles.control}${isGoogle ? ` ${styles.google}` : ""}` : ""}`} type="button" disabled={pending} aria-busy={pending} onClick={() => void startSignIn()}>
        {pending && rounded ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" /> : isGoogle ? <GoogleMark /> : isEmail ? <Mail size={17} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
        <span aria-live="polite">{pending ? pendingLabel : customLabel ?? label}</span>
        {!isGoogle && !(pending && rounded) && <ArrowRight size={16} aria-hidden="true" />}
      </button>
      {signInError && <p className={rounded ? styles.error : "auth-signin-error"} role="alert">{signInError}</p>}
    </div>
  );
}
