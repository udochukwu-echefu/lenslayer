/** Shared identifiers only; the synthetic dataset is loaded on demand. */
export const DEMO_WORKSPACE_ID = "public-workspace";
export const PUBLIC_ACCESS_ENABLED =
  process.env.NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS === "true";

export function isPublicAccessEnabled() {
  return PUBLIC_ACCESS_ENABLED;
}

export function isDemoWorkspace(organizationId?: string | null) {
  return organizationId === DEMO_WORKSPACE_ID;
}
