"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";

export default function SignOutPage() {
  const [pending, setPending] = useState(false);
  async function leave() {
    setPending(true);
    await signOut({ redirect: false });
    window.location.assign("/auth/logout");
  }
  return <main className="auth-page"><section className="auth-card auth-entry"><BrandMark /><div className="auth-state-icon"><LogOut size={20} /></div><div><p className="eyebrow">End session</p><h1>Sign out of LensLayer?</h1><p>Your LensLayer browser session and Auth0 single sign-on session will close.</p></div><div className="auth-actions"><button className="button" type="button" disabled={pending} onClick={() => void leave()}>{pending ? "Signing out..." : "Sign out"}</button><Link className="button secondary" href="/">Cancel</Link></div></section></main>;
}
