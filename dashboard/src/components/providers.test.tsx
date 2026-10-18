import { act, render, screen, waitFor } from "@testing-library/react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { beforeEach, expect, it, vi } from "vitest";
import { Providers } from "./providers";
import { useWorkspace } from "./workspace-provider";
import type { WorkspaceBootstrap } from "@/lib/workspace-bootstrap";

const state = vi.hoisted(() => ({ session: { user: { id: "account-a" }, expires: "2099-01-01" } as Session | null, status: "authenticated", replace: vi.fn() }));
vi.mock("next-auth/react", () => ({ SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({ data: state.session, status: state.status }), getSession: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/tasks", useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/lib/api", async () => {
  const { ApiError } = await import("@/lib/api/client");
  return { ApiError, isPublicAccessEnabled: () => false, isDemoWorkspace: () => false, api: {
    organizations: vi.fn(async () => [{ id: "same-org", name: "Current workspace", role: "viewer" }]),
    me: vi.fn(async () => ({ id: state.session?.user?.id, display_name: "Current user" })), createOrganization: vi.fn(),
  } };
});
const bootstrap: WorkspaceBootstrap = { account: "account-a", updatedAt: Date.now(),
  user: { id: "api-a", email: "synthetic@example.test", display_name: "Account A" },
  organizations: [{ id: "same-org", name: "First", slug: "first", role: "owner", created_at: "2026-01-01" }, { id: "remembered-org", name: "Remembered", slug: "second", role: "viewer", created_at: "2026-01-01" }],
};
let clients: QueryClient[] = [];
const renders: string[] = [];
function Probe() {
  const client = useQueryClient(); if (!clients.includes(client)) clients.push(client);
  const { user, activeOrganization, activeRole, selectOrganization } = useWorkspace();
  const query = useQuery({ queryKey: ["private-records", "same-org"], queryFn: async () => "current-account-data", enabled: false });
  const text = `${user?.display_name ?? "none"}|${activeOrganization?.id ?? "none"}|${activeRole ?? "none"}|${query.data ?? "empty"}`;
  renders.push(text);
  return <div><p>{text}</p><button onClick={() => selectOrganization("not-authorized")}>Invalid selection</button></div>;
}
beforeEach(() => { state.session = { user: { id: "account-a" }, expires: "2099-01-01" }; state.status = "authenticated"; state.replace.mockClear(); clients = []; renders.length = 0; localStorage.clear(); });

it("uses the remembered authorized workspace without painting the first workspace's records", () => {
  localStorage.setItem("lenslayer.activeOrganization", "remembered-org");
  render(<Providers session={state.session} bootstrap={bootstrap}><Probe /></Providers>);
  expect(screen.getByText("Account A|remembered-org|viewer|empty")).toBeInTheDocument();
  expect(renders.some((r) => r.includes("|same-org|"))).toBe(false);
  act(() => screen.getByRole("button").click());
  expect(localStorage.getItem("lenslayer.activeOrganization")).toBe("remembered-org");
});

it("changes account/cache synchronously even when organization-scoped keys are identical", async () => {
  const view = render(<Providers session={state.session} bootstrap={bootstrap}><Probe /></Providers>);
  act(() => { clients[0].setQueryData(["private-records", "same-org"], "PRIVATE-A"); });
  await waitFor(() => expect(screen.getByText(/PRIVATE-A/)).toBeInTheDocument());
  renders.length = 0;
  state.session = { user: { id: "account-b" }, expires: "2099-01-01" };
  view.rerender(<Providers session={state.session} bootstrap={bootstrap}><Probe /></Providers>);
  expect(clients).toHaveLength(2);
  expect(renders.every((r) => !r.includes("PRIVATE-A") && !r.includes("Account A"))).toBe(true);
  expect(clients[0].getQueryCache().getAll()).toHaveLength(0);
  await waitFor(() => expect(screen.getByText(/Current user/)).toBeInTheDocument());
});

it.each(["signed-out", "refresh-error"])("clears private cache and projections for %s", async (scenario) => {
  const view = render(<Providers session={state.session} bootstrap={bootstrap}><Probe /></Providers>);
  act(() => { clients[0].setQueryData(["private-records", "same-org"], "PRIVATE-A"); });
  if (scenario === "signed-out") { state.session = null; state.status = "unauthenticated"; }
  else state.session = { ...state.session!, error: "RefreshAccessTokenError" };
  renders.length = 0;
  view.rerender(<Providers session={state.session} bootstrap={bootstrap}><Probe /></Providers>);
  expect(renders.every((r) => !r.includes("PRIVATE-A") && !r.includes("Account A"))).toBe(true);
  expect(clients[0].getQueryCache().getAll()).toHaveLength(0);
});

it("unmounts and clears private query state on BFF revocation before redirecting", () => {
  render(<Providers session={state.session} bootstrap={bootstrap}><Probe /></Providers>);
  act(() => window.dispatchEvent(new Event("lenslayer:session-invalidated")));
  expect(screen.queryByText(/Account A/)).not.toBeInTheDocument();
  expect(clients[0].getQueryCache().getAll()).toHaveLength(0);
  expect(state.replace).toHaveBeenCalledWith("/auth/session-expired?callbackUrl=%2Ftasks");
});
