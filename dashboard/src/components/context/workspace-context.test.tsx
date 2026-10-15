import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import userEvent from "@testing-library/user-event";
import { api, ApiError } from "@/lib/api";
import type { Role } from "@/lib/types";
import { contextFixture, contextVersionFixture } from "@/test/context-fixtures";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { WorkspaceContextPage } from "./workspace-context";

const workspace = vi.hoisted(() => ({ activeOrganization: { id: "org-1" }, activeRole: "owner" as Role | null, isDemo: false, error: null }));
vi.mock("../workspace-provider", () => ({ useWorkspace: () => workspace }));
vi.mock("@/lib/api", async () => { const { ApiError } = await import("@/lib/api/client"); return { ApiError, api: { contextRecords: vi.fn(), contextRecord: vi.fn(), contextVersion: vi.fn(), createContextRecord: vi.fn(), createContextVersion: vi.fn(), deleteContextRecord: vi.fn() } }; });
beforeEach(() => {
  workspace.activeOrganization = { id: "org-1" }; workspace.activeRole = "owner"; workspace.isDemo = false;
  vi.mocked(api.contextRecords).mockReset().mockResolvedValue([contextFixture]);
  vi.mocked(api.contextRecord).mockReset().mockResolvedValue(contextFixture);
  vi.mocked(api.contextVersion).mockReset().mockResolvedValue(contextVersionFixture);
  vi.mocked(api.createContextRecord).mockReset().mockResolvedValue(contextFixture);
  vi.mocked(api.createContextVersion).mockReset().mockResolvedValue({ ...contextFixture, current_version: 4 });
  vi.mocked(api.deleteContextRecord).mockReset().mockResolvedValue(undefined);
});
const view = (id?: string) => { const query = agentQueryWrapper(); return { ...query, ...render(<WorkspaceContextPage recordId={id} />, { wrapper: query.Wrapper }) }; };

it("creates private context with explicit retention and no credential surface", async () => {
  const { container } = view();
  fireEvent.click(await screen.findByRole("button", { name: "Add context" }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Aster Cloud support brief" } });
  fireEvent.change(screen.getByLabelText("Source text"), { target: { value: "Customer onboarding owner: Riley Chen." } });
  fireEvent.change(screen.getByLabelText("Retention from creation"), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: "Save context" }));
  await waitFor(() => expect(api.createContextRecord).toHaveBeenCalledOnce());
  const [org, body, signal] = vi.mocked(api.createContextRecord).mock.calls[0];
  expect(org).toBe("org-1"); expect(body).toEqual({ title: "Aster Cloud support brief", text: "Customer onboarding owner: Riley Chen.", expires_at: expect.any(String) });
  expect(Date.parse(body.expires_at) - Date.now()).toBeGreaterThan(6.9 * 86400000);
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(container.querySelector('input[name*="token"],input[name*="credential"]')).toBeNull();
});

it.each(["viewer", "reviewer"] as const)("lets %s read retained source safely, never write", async (role) => {
  workspace.activeRole = role;
  const { container } = view(contextFixture.id);
  await screen.findByRole("heading", { name: contextFixture.title });
  expect(api.contextVersion).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Add new version|Delete context/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Read retained version" }));
  expect(await screen.findByText(contextVersionFixture.text)).toBeInTheDocument();
  expect(container.querySelector("script")).toBeNull();
  expect(api.contextVersion).toHaveBeenCalledWith("org-1", contextFixture.id, 3, expect.any(AbortSignal));
});

it("uses expected_version and stops on conflicts until the current record is refreshed", async () => {
  vi.mocked(api.createContextVersion).mockRejectedValue(new ApiError("Conflict", 409));
  view(contextFixture.id);
  fireEvent.click(await screen.findByRole("button", { name: "Add new version" }));
  fireEvent.change(screen.getByLabelText("Replacement source text"), { target: { value: "Reviewed support handoff" } });
  fireEvent.click(screen.getByRole("button", { name: "Save new version" }));
  expect(await screen.findByText("Version conflict")).toBeInTheDocument();
  expect(api.createContextVersion).toHaveBeenCalledWith("org-1", "context-1", { text: "Reviewed support handoff", expected_version: 3 }, expect.any(AbortSignal));
  expect(screen.getByRole("button", { name: "Save new version" })).toBeDisabled();
  expect(api.createContextVersion).toHaveBeenCalledOnce();
  vi.mocked(api.contextRecord).mockResolvedValue({ ...contextFixture, current_version: 4 });
  fireEvent.click(screen.getByRole("button", { name: "Refresh record" }));
  await waitFor(() => expect(screen.queryByText("Version conflict")).toBeNull());
  expect(screen.queryByLabelText("Replacement source text")).toBeNull();
});

it("requires concrete DELETE confirmation and removes retained source after erasure", async () => {
  vi.mocked(api.deleteContextRecord).mockImplementation(async () => { vi.mocked(api.contextRecord).mockResolvedValue({ ...contextFixture, deleted_at: "2026-10-14T12:00:00Z" }); });
  view(contextFixture.id);
  fireEvent.click(await screen.findByRole("button", { name: "Read retained version" }));
  await screen.findByText(contextVersionFixture.text);
  fireEvent.click(screen.getByRole("button", { name: "Delete context" }));
  const erase = screen.getByRole("button", { name: "Erase all retained versions" });
  expect(erase).toBeDisabled(); expect(api.deleteContextRecord).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Type DELETE to erase this context"), { target: { value: "DELETE" } });
  fireEvent.click(erase);
  await waitFor(() => expect(api.deleteContextRecord).toHaveBeenCalledWith("org-1", "context-1", expect.any(AbortSignal)));
  expect(await screen.findByText(/Every retained version was erased/)).toBeInTheDocument();
  expect(screen.queryByText(contextVersionFixture.text)).toBeNull();
});

it("does not read expired versions or expose source writes", async () => {
  vi.mocked(api.contextRecord).mockResolvedValue({ ...contextFixture, expires_at: "2020-01-01T00:00:00Z" });
  view(contextFixture.id);
  expect(await screen.findByText(/Retention expired/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Read retained version|Add new version|Delete context/ })).toBeNull();
  expect(api.contextVersion).not.toHaveBeenCalled();
});

it("hides cached source on membership denial and does not substitute synthetic data", async () => {
  const { client } = view(contextFixture.id);
  fireEvent.click(await screen.findByRole("button", { name: "Read retained version" }));
  await screen.findByText(contextVersionFixture.text);
  vi.mocked(api.contextRecord).mockRejectedValue(new ApiError("Revoked", 403));
  await act(async () => { await client.invalidateQueries({ queryKey: ["context-record", "org-1", "context-1"] }); });
  expect(await screen.findByText("Access restricted")).toBeInTheDocument();
  expect(screen.queryByText(contextVersionFixture.text)).toBeNull();
  expect(screen.queryByRole("button", { name: "Add new version" })).toBeNull();
});

it("keeps synthetic preview read-only and denies a missing membership before requests", async () => {
  workspace.isDemo = true; const first = view();
  expect(await screen.findByText(/Synthetic preview/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add context" })).toBeNull(); first.unmount();
  vi.mocked(api.contextRecords).mockClear(); workspace.isDemo = false; workspace.activeRole = null;
  view(); expect(screen.getByRole("alert")).toHaveTextContent("Workspace membership is required");
  expect(api.contextRecords).not.toHaveBeenCalled();
});

it("drops a late source response from the previous workspace", async () => {
  let resolve!: (value: typeof contextVersionFixture) => void;
  vi.mocked(api.contextVersion).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { rerender } = view(contextFixture.id);
  fireEvent.click(await screen.findByRole("button", { name: "Read retained version" }));
  await waitFor(() => expect(api.contextVersion).toHaveBeenCalled());
  const signal = vi.mocked(api.contextVersion).mock.calls[0][3]!;
  workspace.activeOrganization = { id: "org-2" };
  vi.mocked(api.contextRecord).mockRejectedValue(new ApiError("Not in workspace", 404));
  rerender(<WorkspaceContextPage recordId={contextFixture.id} />);
  await act(async () => resolve(contextVersionFixture));
  expect(await screen.findByText("Context unavailable")).toBeInTheDocument();
  expect(signal.aborted).toBe(true); expect(screen.queryByText(contextVersionFixture.text)).toBeNull();
});

it("has keyboard-reachable labelled controls and no detected axe violations in the context editor", async () => {
  const user = userEvent.setup(); const { container } = view();
  await screen.findByRole("button", { name: "Add context" });
  await user.tab(); expect(screen.getByRole("button", { name: "Add context" })).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByLabelText("Title")).toBeInTheDocument();
  expect((await axe(container)).violations).toEqual([]);
});

it("clears retained source from the query cache when hidden and requests it anew on reopening", async () => {
  const { client } = view(contextFixture.id);
  fireEvent.click(await screen.findByRole("button", { name: "Read retained version" }));
  await screen.findByText(contextVersionFixture.text);
  fireEvent.click(screen.getByRole("button", { name: "Hide source" }));
  await waitFor(() => expect(client.getQueryData(["context-record", "org-1", contextFixture.id, "version", 3])).toBeUndefined());
  expect(screen.queryByText(contextVersionFixture.text)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Read retained version" }));
  await screen.findByText(contextVersionFixture.text);
  expect(api.contextVersion).toHaveBeenCalledTimes(2);
});

it.each([{ record_id: "other-record" }, { version_number: 2 }])("does not display mismatched retained source: %j", async (mismatch) => {
  vi.mocked(api.contextVersion).mockResolvedValue({ ...contextVersionFixture, ...mismatch });
  view(contextFixture.id);
  fireEvent.click(await screen.findByRole("button", { name: "Read retained version" }));
  expect(await screen.findByText("Context could not load")).toBeInTheDocument();
  expect(screen.queryByText(contextVersionFixture.text)).toBeNull();
});
