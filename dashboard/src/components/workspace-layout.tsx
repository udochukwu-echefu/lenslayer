import { Suspense } from "react";
import { AppShell } from "./app-shell";
import { Providers } from "./providers";
import { PageLoading } from "./page-states";
import { readWorkspaceBootstrap } from "@/lib/workspace-bootstrap.server";
import "@/app/globals.css";

async function PrivateWorkspace({ children }: { children: React.ReactNode }) {
  const { session, bootstrap } = await readWorkspaceBootstrap();
  return <Providers session={session} bootstrap={bootstrap}><AppShell>{children}</AppShell></Providers>;
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="page" aria-label="Loading workspace"><PageLoading /></main>}>
    <PrivateWorkspace>{children}</PrivateWorkspace>
  </Suspense>;
}
