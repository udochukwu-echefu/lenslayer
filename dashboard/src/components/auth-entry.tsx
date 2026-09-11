import { ShieldCheck } from "lucide-react";
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
    eyebrow: "Welcome back",
    title: "Sign in to LensLayer",
    description: "Return to your agreement reviews and linked decisions.",
    switchLabel: "New to LensLayer?",
    switchAction: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    eyebrow: "Get started",
    title: "Create your account",
    description: "Start a private workspace for evidence-led agreement review.",
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
        <Link className="auth-lockup" href="/" aria-label="LensLayer home">
          <Image src="/lenslayer-lockup.svg" width={128} height={44} alt="LensLayer" priority />
        </Link>

        <div className="auth-main">
          <section className="auth-editorial" aria-labelledby="auth-story-title">
            <Image
              className="auth-editorial-image"
              src="/auth-editorial-panel.png"
              fill
              sizes="(max-width: 1050px) 0px, 604px"
              alt=""
              priority
            />
            <div className="auth-editorial-shade" aria-hidden="true" />
            <h2 id="auth-story-title">
              The all in one<br />
              document<br />
              <span>intelligence</span><br />
              platform
            </h2>
          </section>

          <section className="auth-access" aria-labelledby="auth-entry-title">
            <div className="auth-access-inner">
              <header className="auth-entry-heading">
                <p className="auth-entry-eyebrow">{content.eyebrow}</p>
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
                <ShieldCheck size={20} aria-hidden="true" />
                <p>Authentication is handled securely by Google or Auth0.</p>
              </div>

              <p className="auth-switch">{content.switchLabel} <Link href={switchHref}>{content.switchAction}</Link></p>
            </div>
          </section>
        </div>

        <footer className="auth-footer">
          <p><span>Privacy</span><span aria-hidden="true">·</span><span>Terms</span></p>
          <p>Evidence before conclusion.</p>
        </footer>
      </div>
    </main>
  );
}
