"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { createContext, useContext, useMemo, useState } from "react";
import { api, isDemoWorkspace, isPublicAccessEnabled } from "@/lib/api";
import type { Organization, Role, User } from "@/lib/types";

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

export function resolveWorkspaceAccess(publicAccess: boolean, sessionStatus: "authenticated" | "loading" | "unauthenticated") {
  return {
    useDemoWorkspace: publicAccess,
    canLoadWorkspace: sessionStatus !== "loading" && (publicAccess || sessionStatus === "authenticated"),
  };
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { status: sessionStatus } = useSession();
  const [activeId, setActiveId] = useState<string | null>(() => typeof window === "undefined" ? null : window.localStorage.getItem(storageKey));
  const publicAccess = isPublicAccessEnabled();
  const { useDemoWorkspace, canLoadWorkspace } = resolveWorkspaceAccess(publicAccess, sessionStatus);
  const workspaceMode = useDemoWorkspace ? "demo" : "private";
  const organizationsQuery = useQuery({ queryKey: ["organizations", workspaceMode], queryFn: () => api.organizations(useDemoWorkspace), enabled: canLoadWorkspace });
  const userQuery = useQuery({ queryKey: ["me", workspaceMode], queryFn: () => api.me(useDemoWorkspace), enabled: canLoadWorkspace });

  const activeOrganization = organizationsQuery.data?.find((item) => item.id === activeId) ?? organizationsQuery.data?.[0] ?? null;
  const activeRole = activeOrganization?.role ?? null;

  const value = useMemo<WorkspaceValue>(() => ({
    organizations: organizationsQuery.data ?? [],
    activeOrganization,
    activeRole,
    canUpload: activeRole === "owner" || activeRole === "admin" || activeRole === "reviewer",
    canDelete: activeRole === "owner" || activeRole === "admin",
    canManageTeam: activeRole === "owner" || activeRole === "admin",
    isDemo: isDemoWorkspace(activeOrganization?.id),
    user: userQuery.data ?? null,
    isLoading: sessionStatus === "loading" || organizationsQuery.isLoading || userQuery.isLoading,
    error: (organizationsQuery.error ?? userQuery.error) as Error | null,
    selectOrganization: (id) => { setActiveId(id); window.localStorage.setItem(storageKey, id); },
  }), [activeOrganization, activeRole, organizationsQuery.data, organizationsQuery.error, organizationsQuery.isLoading, sessionStatus, userQuery.data, userQuery.error, userQuery.isLoading]);

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
