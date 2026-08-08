"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Organization, Role, User } from "@/lib/types";

type WorkspaceValue = {
  organizations: Organization[];
  activeOrganization: Organization | null;
  user: User | null;
  activeRole: Role | null;
  canUpload: boolean;
  canDelete: boolean;
  canManageTeam: boolean;
  isLoading: boolean;
  error: Error | null;
  selectOrganization: (id: string) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);
const storageKey = "lenslayer.activeOrganization";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(() => typeof window === "undefined" ? null : window.localStorage.getItem(storageKey));
  const organizationsQuery = useQuery({ queryKey: ["organizations"], queryFn: api.organizations });
  const userQuery = useQuery({ queryKey: ["me"], queryFn: api.me });

  const activeOrganization = organizationsQuery.data?.find((item) => item.id === activeId) ?? organizationsQuery.data?.[0] ?? null;
  const activeRole = activeOrganization?.role ?? null;

  const value = useMemo<WorkspaceValue>(() => ({
    organizations: organizationsQuery.data ?? [],
    activeOrganization,
    activeRole,
    canUpload: activeRole === "owner" || activeRole === "admin" || activeRole === "reviewer",
    canDelete: activeRole === "owner" || activeRole === "admin",
    canManageTeam: activeRole === "owner" || activeRole === "admin",
    user: userQuery.data ?? null,
    isLoading: organizationsQuery.isLoading || userQuery.isLoading,
    error: (organizationsQuery.error ?? userQuery.error) as Error | null,
    selectOrganization: (id) => { setActiveId(id); window.localStorage.setItem(storageKey, id); },
  }), [activeOrganization, activeRole, organizationsQuery.data, organizationsQuery.error, organizationsQuery.isLoading, userQuery.data, userQuery.error, userQuery.isLoading]);

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
