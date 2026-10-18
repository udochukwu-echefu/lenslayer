/** Server-only through trusted-session.server's next/headers dependency. */
import { readPrivateWorkspaceSession } from "./trusted-session.server";
import type { Organization, Role, User } from "./types";
import type { WorkspaceBootstrap } from "./workspace-bootstrap";

export async function readWorkspaceBootstrap() {
  const { session, trusted } = await readPrivateWorkspaceSession();
  if (!session?.user?.id || session.error || !trusted) return { session, bootstrap: null };
  const base = (process.env.PLATFORM_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  try {
    const load = async (path: string) => {
      const response = await fetch(`${base}/api/v1/${path}`, {
        headers: { Authorization: `Bearer ${trusted.accessToken}` }, cache: "no-store",
        // The server projection is best-effort, not a wait for a cold API.
        redirect: "manual", signal: AbortSignal.timeout(750),
      });
      if (!response.ok) throw new Error("Workspace bootstrap unavailable");
      return response.json();
    };
    const [rawUser, rawOrganizations] = await Promise.all([load("me"), load("organizations")]);
    const user: User = { id: rawUser.id, email: rawUser.email, display_name: rawUser.display_name };
    const organizations: Organization[] = rawOrganizations.map((item: Organization) => ({
      id: item.id, name: item.name, slug: item.slug, created_at: item.created_at,
      role: (["owner", "admin", "reviewer", "viewer"] as Role[]).includes(item.role as Role) ? item.role : null,
    }));
    const bootstrap: WorkspaceBootstrap = { account: session.user.id, user, organizations, updatedAt: Date.now() };
    return { session, bootstrap };
  } catch {
    // No URLs, response bodies, provider details or credentials in logs/HTML.
    // Let the existing client error/retry/gate behavior handle API failures.
    return { session, bootstrap: null };
  }
}
