import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { WorkspaceGate } from "./workspace-gate";

const state = vi.hoisted(() => ({ organizations: [] as { id: string }[], isLoading: false, error: null as Error | null }));
const createWorkspace = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false, error: null }));
const signIn = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/contracts", useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signIn, useSession: () => ({ status: "authenticated", data: {} }) }));
vi.mock("./workspace-provider", () => ({ useWorkspace: () => state, useCreateWorkspace: () => createWorkspace }));
vi.mock("@/lib/api", async () => {
  const { ApiError } = await import("@/lib/api/client");
  return { ApiError, isPublicAccessEnabled: () => false };
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { organizations: [], isLoading: false, error: null });
});

it("tells a new user with an unverified email what to do instead of asking them to refresh", () => {
  state.error = new ApiError("Verify your email address before using LensLayer.", 403);
  render(<WorkspaceGate><p>inside</p></WorkspaceGate>);
  expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
  expect(screen.queryByText(/Refresh the page/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /verified my email/ }));
  expect(signIn).toHaveBeenCalledWith("oidc", { callbackUrl: "/contracts" });
  expect(screen.getByRole("link", { name: "Use a different account" })).toHaveAttribute("href", "/auth/signout");
});

it("retries with a unique slug when the workspace name is already taken", async () => {
  createWorkspace.mutateAsync
    .mockRejectedValueOnce(new ApiError("That organization slug is already in use.", 409))
    .mockResolvedValueOnce({ id: "org-2" });
  render(<WorkspaceGate><p>inside</p></WorkspaceGate>);
  fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Acme" } });
  fireEvent.click(screen.getByRole("button", { name: /Create workspace/ }));
  await waitFor(() => expect(createWorkspace.mutateAsync).toHaveBeenCalledTimes(2));
  expect(createWorkspace.mutateAsync.mock.calls[0][0]).toEqual({ name: "Acme", slug: "acme" });
  expect(createWorkspace.mutateAsync.mock.calls[1][0].slug).toMatch(/^acme-[0-9a-f]{6}$/);
});

it("still creates a workspace when the name has no Latin letters", async () => {
  createWorkspace.mutateAsync.mockResolvedValueOnce({ id: "org-3" });
  render(<WorkspaceGate><p>inside</p></WorkspaceGate>);
  fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "日本企業" } });
  fireEvent.click(screen.getByRole("button", { name: /Create workspace/ }));
  await waitFor(() => expect(createWorkspace.mutateAsync).toHaveBeenCalledTimes(1));
  expect(createWorkspace.mutateAsync.mock.calls[0][0]).toMatchObject({ name: "日本企業", slug: expect.stringMatching(/^workspace-[0-9a-f]{6}$/) });
});
