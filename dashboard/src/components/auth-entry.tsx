import { ArrowUpRight, Check, FileText, Link2, ShieldCheck, UserRoundCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SignInButton } from "@/components/sign-in-button";

type AuthEntryProps = {
  callbackUrl: string;
  configured: boolean;
  mode: "signin" | "signup";
};

const copy = {
  signin: {
    title: "Welcome back",
    description: "Sign in to return to your agreement reviews and evidence-linked decisions.",
    switchLabel: "New to LensLayer?",
    switchAction: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    title: "Create your account",
    description: "Set up a private workspace for agreement review, or join a team through an invitation.",
    switchLabel: "Already have an account?",
    switchAction: "Sign in",
    switchHref: "/signin",
  },
} as const;

export function AuthEntry({ callbackUrl, configured, mode }: AuthEntryProps) {
  const content = copy[mode];
  const switchHref = `${content.switchHref}?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <main className="auth-portal">
      <div className="auth-frame">
        <section className="auth-story" aria-labelledby="auth-story-title">
          <Link className="auth-lockup" href="/sample" aria-label="LensLayer public sample">
            <Image src="/lenslayer-mark-duotone.svg" width={36} height={36} alt="" priority />
            <span>LensLayer</span>
          </Link>

          <div className="auth-story-content">
            <h2 id="auth-story-title">Find the clause. Follow the evidence.</h2>
            <p>LensLayer keeps each finding connected to its source, so consequential decisions remain reviewable and attributable.</p>

            <figure className="auth-review-sample">
              <figcaption>Illustrative review trail</figcaption>
              <blockquote>
                <FileText size={18} aria-hidden="true" />
                <p>“Supplier may revise the Charges from time to time by written notice.”</p>
              </blockquote>
              <div className="auth-review-row">
                <Link2 size={17} aria-hidden="true" />
                <span><small>Finding</small><strong>Price changes deserve review</strong></span>
                <Check size={16} aria-hidden="true" />
              </div>
              <div className="auth-review-row">
                <UserRoundCheck size={17} aria-hidden="true" />
                <span><small>Decision</small><strong>Awaiting a human owner</strong></span>
                <span className="auth-review-status">Open</span>
              </div>
            </figure>
          </div>

          <Link className="auth-sample-link" href="/sample">Explore the public sample <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </section>

        <section className="auth-access" aria-labelledby="auth-entry-title">
          <div className="auth-mobile-lockup" aria-label="LensLayer">
            <Image src="/lenslayer-mark-duotone.svg" width={32} height={32} alt="" priority />
            <span>LensLayer</span>
          </div>

          <div className="auth-access-inner">
            <header className="auth-entry-heading">
              <h1 id="auth-entry-title">{content.title}</h1>
              <p>{content.description}</p>
            </header>

            <div className="auth-provider-stack" role="group" aria-label="Authentication options">
              {configured ? <>
                <SignInButton callbackUrl={callbackUrl} configured mode={mode} method="google" />
                <div className="auth-divider"><span>or</span></div>
                <SignInButton callbackUrl={callbackUrl} configured mode={mode} method="email" />
              </> : <SignInButton callbackUrl={callbackUrl} configured={false} mode={mode} />}
            </div>

            <div className="auth-security-note">
              <ShieldCheck size={18} aria-hidden="true" />
              <p><strong>Your credentials stay private.</strong> Google or Auth0 verifies your identity. LensLayer never receives your password.</p>
            </div>

            <p className="auth-switch">{content.switchLabel} <Link href={switchHref}>{content.switchAction}</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}
