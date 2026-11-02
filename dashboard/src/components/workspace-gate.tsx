"use client";

import { AlertTriangle, ArrowRight, Building2, LoaderCircle, MailCheck } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useCreateWorkspace, useWorkspace } from "./workspace-provider";
import { ApiError, isPublicAccessEnabled } from "@/lib/api";
import { PageLoading } from "./page-states";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

// People never see the slug, so a taken or unusable one must not block setup.
function uniqueSlug(base: string) {
  const suffix = crypto.randomUUID().slice(0, 6);
  return base.length >= 2 ? `${base.slice(0, 113)}-${suffix}` : `workspace-${suffix}`;
}

export function unauthenticatedDestination(pathname: string) {
  if (pathname === "/") return "/sample";
  return `/signin?callbackUrl=${encodeURIComponent(pathname)}`;
}

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { organizations, isLoading, error } = useWorkspace();
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  // Only this static guide is readable independently of workspace access. Its
  // Settings shell stays mounted; sibling settings and data routes remain gated.
  const isStaticDeveloperGuide = pathname === "/settings/developers";
  const router = useRouter();
  const createWorkspace = useCreateWorkspace();
  const [name, setName] = useState("");
  const authRequired = !isPublicAccessEnabled();
  const unauthorized = error instanceof ApiError && error.status === 401;
  const privateSessionExpired = session?.error === "RefreshAccessTokenError" || (sessionStatus === "authenticated" && unauthorized);

  useEffect(() => {
    if (isStaticDeveloperGuide) return;
    const callbackUrl = encodeURIComponent(pathname || "/");
    if (privateSessionExpired) router.replace(`/auth/session-expired?callbackUrl=${callbackUrl}`);
    else if (authRequired && sessionStatus === "unauthenticated") router.replace(unauthenticatedDestination(pathname || "/"));
  }, [authRequired, isStaticDeveloperGuide, pathname, privateSessionExpired, router, sessionStatus]);

  if (isStaticDeveloperGuide) return children;

  if (isLoading || privateSessionExpired || (authRequired && sessionStatus !== "authenticated")) {
    return <main className="gate"><LoaderCircle className="gate-spinner" aria-label="Loading workspace" /><p>Opening your workspace…</p><PageLoading rows={3} /></main>;
  }

  // The API refuses unverified Auth0 emails; refreshing can't fix that, a new sign-in after verifying does.
  if (error instanceof ApiError && error.status === 403 && /verify your email/i.test(error.message)) {
    return (
      <main className="gate">
        <div className="gate-card">
          <div className="gate-symbol"><MailCheck size={20} aria-hidden="true" /></div>
          <p className="eyebrow">One more step</p>
          <h1>Verify your email</h1>
          <p>We sent a verification link to the address you signed up with. Open it (check spam if it isn&rsquo;t there), then come back here.</p>
          <button className="button" type="button" onClick={() => void signIn("oidc", { callbackUrl: pathname || "/" })}>I&rsquo;ve verified my email<ArrowRight size={16} /></button>
          <Link className="button secondary" href="/auth/signout">Use a different account</Link>
        </div>
      </main>
    );
  }

  if (error) {
    const unavailable = error instanceof ApiError && error.status === 503;
    return (
      <main className="gate">
        <div className="gate-card">
          <AlertTriangle size={24} aria-hidden="true" />
          <p className="eyebrow">Connection needed</p>
          <h1>The workspace could not open.</h1>
          <p>{unavailable ? "Refresh the page to reopen the demo workspace." : "LensLayer could not load this workspace. Refresh the page and try again."}</p>
          <button className="button" type="button" onClick={() => window.location.reload()}>Refresh workspace<ArrowRight size={16} /></button>
        </div>
      </main>
    );
  }

  if (organizations.length) return children;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const base = slugify(name);
    const payload = { name: name.trim(), slug: base.length >= 2 ? base : uniqueSlug(base) };
    try {
      await createWorkspace.mutateAsync(payload);
    } catch (failure) {
      // createWorkspace.error renders anything other than a slug clash.
      if (failure instanceof ApiError && failure.status === 409) {
        await createWorkspace.mutateAsync({ ...payload, slug: uniqueSlug(base) }).catch(() => undefined);
      }
    }
  }

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-symbol"><Building2 size={20} /></div>
        <p className="eyebrow">Workspace setup</p>
        <h1>Create a workspace</h1>
        <p>Set the shared boundary for agreements, evidence, reviewers, and activity history.</p>
        <div className="field">
          <label htmlFor="workspace-name">Workspace name</label>
          <input id="workspace-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Relay Software Ltd" minLength={2} maxLength={255} required autoFocus />
          <p className="field-help">This appears on reviews, audit activity, and future team invitations.</p>
        </div>
        {createWorkspace.error && <p className="form-error" role="alert">{createWorkspace.error.message}</p>}
        <button className="button" type="submit" disabled={createWorkspace.isPending || name.trim().length < 2}>
          {createWorkspace.isPending ? "Creating workspace…" : "Create workspace"}<ArrowRight size={16} />
        </button>
      </form>
    </main>
  );
}
