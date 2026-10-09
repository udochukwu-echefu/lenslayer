"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { canAdministerAgents } from "@/lib/agent-state";
import { PageLoading } from "../page-states";
import { useWorkspace } from "../workspace-provider";

/** Keyed children drop local state and abort in-flight writes on access changes. */
export function HostedTaskAccess({ children }: { children: (org: string, scopeKey: string) => ReactNode }) {
  const { activeOrganization, activeRole, user, isDemo, isLoading, error } = useWorkspace();
  const { data: session, status } = useSession();
  if (isDemo) return <div className="page agent-page"><h1 className="page-title">Agent tasks</h1><p className="agent-notice"><strong>Synthetic preview · read-only.</strong> No hosted agent is assigned or running in the public walkthrough. Sign in as a private workspace owner or administrator to assign a task.</p><div className="agent-controls"><Link className="button" href="/signin">Sign in</Link><Link className="button secondary" href="/runs">Inspect synthetic sample runs</Link></div></div>;
  if (isLoading || status === "loading") return <div className="page"><PageLoading /></div>;
  if (error || status !== "authenticated" || session?.error || !user || !activeOrganization) return <div className="page agent-page"><h1 className="page-title">Agent tasks</h1><p role="alert">Private workspace access could not be confirmed. Sign in again before assigning or inspecting hosted agent tasks.</p><Link className="button secondary" href="/signin">Sign in</Link></div>;
  if (!canAdministerAgents(activeRole, false)) return <div className="page agent-page"><h1 className="page-title">Agent tasks</h1><div className="inline-state"><div><h2>Administrator access required</h2><p>Only workspace owners and administrators can assign, inspect or cancel hosted agent tasks. Your role can inspect the existing run ledger.</p><Link className="button secondary" href="/runs">View runs</Link></div></div></div>;
  const key = `${activeOrganization.id}:${user.id}:${session?.user?.id ?? session?.user?.email ?? "session"}:${activeRole}`;
  return children(activeOrganization.id, key);
}
