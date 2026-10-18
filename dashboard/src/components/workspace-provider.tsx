"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import { api, isDemoWorkspace, isPublicAccessEnabled } from "@/lib/api";
import type { Organization, Role, User } from "@/lib/types";
import { sessionAccount, workspaceQueryKey } from "@/lib/workspace-bootstrap";

type WorkspaceValue = {
  organizations: Organization[];
  activeOrganization: Organization | null;
  user: User | null;
  activeRole: Role | null;
  canUpload: boolean;
  canDelete: boolean;
  canManageTeam: boolean;
  isDemo: boolean;
  isLoading: boolean;
  error: Error | null;
  selectOrganization: (id: string) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const storageKey = "lenslayer.activeOrganization";
const subscribeHydration = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

function rememberedOrganization() {
  try { return typeof window === "undefined" ? null : window.localStorage.getItem(storageKey); }
  catch { return null; }
}

export function resolveWorkspaceAccess(publicAccess: boolean, sessionStatus: "authenticated" | "loading" | "unauthenticated") {
  const useDemoWorkspace = publicAccess && sessionStatus === "unauthenticated";
  return {
    useDemoWorkspace,
    canLoadWorkspace: sessionStatus !== "loading" && (useDemoWorkspace || sessionStatus === "authenticated"),
  };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const [activeId, setActiveId] = useState<string | null>(rememberedOrganization);
  // Server HTML cannot know localStorage. Its hydration snapshot must not paint
  // the first workspace's records before restoring a different remembered one.
  const selectionReady = useSyncExternalStore(subscribeHydration, browserSnapshot, serverSnapshot);
  const publicAccess = isPublicAccessEnabled();
  const access = resolveWorkspaceAccess(publicAccess, sessionStatus);
  const account = sessionAccount(session);
  const useDemoWorkspace = access.useDemoWorkspace;
  const canLoadWorkspace = access.canLoadWorkspace && (useDemoWorkspace || Boolean(account));
  const workspaceMode = useDemoWorkspace ? "demo" : "private";
  const organizationsQuery = useQuery({ queryKey: workspaceQueryKey("organizations", workspaceMode, account), queryFn: () => api.organizations(useDemoWorkspace), enabled: canLoadWorkspace });
  const userQuery = useQuery({ queryKey: workspaceQueryKey("me", workspaceMode, account), queryFn: () => api.me(useDemoWorkspace), enabled: canLoadWorkspace });

  const activeOrganization = canLoadWorkspace && selectionReady ? organizationsQuery.data?.find((item) => item.id === activeId) ?? organizationsQuery.data?.[0] ?? null : null;
  const activeRole = activeOrganization?.role ?? null;

  const value = useMemo<WorkspaceValue>(() => ({
    organizations: canLoadWorkspace ? organizationsQuery.data ?? [] : [],
    activeOrganization,
    activeRole,
    canUpload: activeRole === "owner" || activeRole === "admin" || activeRole === "reviewer",
    canDelete: activeRole === "owner" || activeRole === "admin",
    canManageTeam: activeRole === "owner" || activeRole === "admin",
    isDemo: isDemoWorkspace(activeOrganization?.id),
    user: canLoadWorkspace ? userQuery.data ?? null : null,
    isLoading: !selectionReady || sessionStatus === "loading" || organizationsQuery.isLoading || userQuery.isLoading,
    error: (organizationsQuery.error ?? userQuery.error) as Error | null,
    selectOrganization: (id) => { if (!organizationsQuery.data?.some((item) => item.id === id)) return; setActiveId(id); try { window.localStorage.setItem(storageKey, id); } catch { /* in-memory selection still works */ } },
  }), [activeOrganization, activeRole, canLoadWorkspace, organizationsQuery.data, organizationsQuery.error, organizationsQuery.isLoading, selectionReady, sessionStatus, userQuery.data, userQuery.error, userQuery.isLoading]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createOrganization,
    onSuccess: async (organization) => {
      window.localStorage.setItem(storageKey, organization.id);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}
