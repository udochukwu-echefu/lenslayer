"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { seedAuthenticatedSession } from "@/lib/api/client";
import { sessionAccount, workspaceQueryKey, type WorkspaceBootstrap } from "@/lib/workspace-bootstrap";
import { WorkspaceProvider } from "./workspace-provider";
import { PageLoading } from "./page-states";

function AccountQueries({ children, session, bootstrap }: { children: React.ReactNode; session: Session | null; bootstrap?: WorkspaceBootstrap | null }) {
  const [client] = useState(() => {
    seedAuthenticatedSession(session);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } } });
    const account = sessionAccount(session);
    if (bootstrap && bootstrap.account === account) {
      client.setQueryData(workspaceQueryKey("me", "private", account), bootstrap.user, { updatedAt: bootstrap.updatedAt });
      client.setQueryData(workspaceQueryKey("organizations", "private", account), bootstrap.organizations, { updatedAt: bootstrap.updatedAt });
    }
    return client;
  });
  useEffect(() => () => { client.clear(); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function AccountBoundary({ children, workspace, bootstrap }: { children: React.ReactNode; workspace: boolean; bootstrap?: WorkspaceBootstrap | null }) {
  const { data: session, status } = useSession();
  const [rejected, setRejected] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const reject = () => setRejected(true);
    window.addEventListener("lenslayer:session-invalidated", reject);
    return () => window.removeEventListener("lenslayer:session-invalidated", reject);
  }, []);
  useEffect(() => {
    if (rejected) router.replace(`/auth/session-expired?callbackUrl=${encodeURIComponent(pathname || "/")}`);
  }, [pathname, rejected, router]);
  // A different account (or expiry/signout/error) gets a NEW cache and remounted
  // query observers in this render, not an effect after old private data paints.
  const account = status === "authenticated" ? sessionAccount(session) : null;
  const key = account ?? (status === "loading" ? "loading" : "signed-out");
  if (rejected) return <main className="page" aria-label="Loading workspace"><PageLoading /></main>;
  return <AccountQueries key={key} session={session} bootstrap={bootstrap}>
    {workspace ? <WorkspaceProvider>{children}</WorkspaceProvider> : children}
  </AccountQueries>;
}

export function Providers({ children, session, bootstrap }: { children: React.ReactNode; session: Session | null; bootstrap?: WorkspaceBootstrap | null }) {
  return <SessionProvider session={session}><AccountBoundary workspace bootstrap={bootstrap}>{children}</AccountBoundary></SessionProvider>;
}

// Invitations deliberately retain signed-in affordances; shared previews and
// sample/auth pages do not need this provider at all.
export function InvitationProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider><AccountBoundary workspace={false}>{children}</AccountBoundary></SessionProvider>;
}
