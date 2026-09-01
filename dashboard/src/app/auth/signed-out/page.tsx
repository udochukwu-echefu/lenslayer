import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function SignedOutPage() {
  return <main className="auth-page"><section className="auth-card auth-entry"><BrandMark /><div className="auth-state-icon success"><CheckCircle2 size={20} /></div><div><p className="eyebrow">Session closed</p><h1>You are signed out.</h1><p>This browser no longer has access to your private LensLayer workspaces.</p></div><div className="auth-actions"><Link className="button" href="/signin">Sign in again</Link><Link className="button secondary" href="/sample">View public sample</Link></div></section></main>;
}
