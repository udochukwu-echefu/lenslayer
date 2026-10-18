import type { Session } from "next-auth";
import type { Organization, User } from "./types";

// Browser-safe allowlisted data only. The trusted bearer/session identity is never
// part of this contract. Account is the auth subject, not the API's user row ID.
export type WorkspaceBootstrap = {
  account: string;
  user: User;
  organizations: Organization[];
  updatedAt: number;
};

export function sessionAccount(session: Session | null | undefined) {
  return session?.user?.id && !session.error && Date.parse(session.expires) > Date.now() ? session.user.id : null;
}

export function workspaceQueryKey(kind: "me" | "organizations", mode: string, account: string | null) {
  return [kind, mode, account] as const;
}
