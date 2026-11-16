import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";
import type { Organization, Role, User } from "./shared/types";
import { storage, storageKeys } from "./storage";

/**
 * The signed-in user, their workspaces, and the active one. Permission flags
 * mirror dashboard/src/components/workspace-provider.tsx; the backend still
 * enforces every rule, these only decide which controls to show.
 */
type WorkspaceValue = {
  organizations: Organization[];
  activeOrganization: Organization | null;
  organizationId: string;
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

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectionReady, setSelectionReady] = useState(false);

  useEffect(() => {
    void storage.get(storageKeys.activeOrganization).then((value) => { setActiveId(value); setSelectionReady(true); });
  }, []);

  const organizationsQuery = useQuery({ queryKey: ["organizations"], queryFn: api.organizations, enabled: signedIn });
  const userQuery = useQuery({ queryKey: ["me"], queryFn: api.me, enabled: signedIn });

  const value = useMemo<WorkspaceValue>(() => {
    const organizations = signedIn ? organizationsQuery.data ?? [] : [];
    const activeOrganization = selectionReady ? organizations.find((item) => item.id === activeId) ?? organizations[0] ?? null : null;
    const activeRole = activeOrganization?.role ?? null;
    return {
      organizations,
      activeOrganization,
      organizationId: activeOrganization?.id ?? "",
      user: signedIn ? userQuery.data ?? null : null,
      activeRole,
      canUpload: activeRole === "owner" || activeRole === "admin" || activeRole === "reviewer",
      canDelete: activeRole === "owner" || activeRole === "admin",
      canManageTeam: activeRole === "owner" || activeRole === "admin",
      isLoading: signedIn && (!selectionReady || organizationsQuery.isLoading || userQuery.isLoading),
      error: (organizationsQuery.error ?? userQuery.error) as Error | null,
      selectOrganization: (id) => {
        if (!organizations.some((item) => item.id === id)) return;
        setActiveId(id);
        void storage.set(storageKeys.activeOrganization, id);
      },
    };
  }, [activeId, organizationsQuery.data, organizationsQuery.error, organizationsQuery.isLoading, selectionReady, signedIn, userQuery.data, userQuery.error, userQuery.isLoading]);

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace() {
  const value = use(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

/** People never see the slug, so a taken one must not block setup (same as the dashboard). */
export function workspaceSlug(name: string) {
  const base = slugify(name);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base.length >= 2 ? `${base.slice(0, 113)}-${suffix}` : `workspace-${suffix}`;
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createOrganization({ name: name.trim(), slug: workspaceSlug(name) }),
    onSuccess: async (organization) => {
      await storage.set(storageKeys.activeOrganization, organization.id);
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}
