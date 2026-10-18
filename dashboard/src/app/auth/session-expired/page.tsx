import { Clock3 } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { SignInButton } from "@/components/sign-in-button";
import { oidcConfigured, safeCallbackUrl } from "@/lib/auth";
import styles from "@/components/auth-surface.module.css";

export default async function SessionExpiredPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string | string[] }> }) {
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="session-expired-title">
        <BrandMark />
        <header className={styles.heading}>
          <p className={styles.status}><Clock3 size={16} aria-hidden="true" />Session expired</p>
          <h1 id="session-expired-title">Sign back in</h1>
          <p>Sign in again to return to your workspace.</p>
        </header>
        <SignInButton callbackUrl={callbackUrl} configured={oidcConfigured} label="Sign back in" appearance="rounded" />
      </section>
    </main>
  );
}
