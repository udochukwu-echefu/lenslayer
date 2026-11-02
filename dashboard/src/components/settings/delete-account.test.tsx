import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { DeleteAccount } from "./delete-account";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signOut }));
vi.mock("@/lib/api", () => ({ api: { accountDeletionPreview: vi.fn(), deleteAccount: vi.fn() } }));

const assign = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue(undefined);
  vi.stubGlobal("location", { ...window.location, assign });
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><DeleteAccount /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
}

it("only deletes after the exact confirmation, then signs out everywhere", async () => {
  vi.mocked(api.accountDeletionPreview).mockResolvedValue({ blocking_workspaces: [] });
  vi.mocked(api.deleteAccount).mockResolvedValue({ deleted_workspaces: 1, left_workspaces: 0, identity_removed: true });
  mount();
  const submit = await screen.findByRole("button", { name: "Permanently delete" });
  fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "delete" } });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: "DELETE" } });
  fireEvent.click(submit);
  await waitFor(() => expect(assign).toHaveBeenCalledWith("/auth/logout"));
  expect(api.deleteAccount).toHaveBeenCalledWith("DELETE");
  expect(signOut).toHaveBeenCalledWith({ redirect: false });
});

it("sends the last owner of a shared workspace to the team page instead of offering deletion", async () => {
  vi.mocked(api.accountDeletionPreview).mockResolvedValue({ blocking_workspaces: ["Northstar"] });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("only owner of Northstar");
  expect(screen.getByRole("link", { name: /Make another member an owner/ })).toHaveAttribute("href", "/team");
  expect(screen.queryByRole("button", { name: "Permanently delete" })).toBeNull();
});
