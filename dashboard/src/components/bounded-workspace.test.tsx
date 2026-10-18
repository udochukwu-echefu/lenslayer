import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { api } from "@/lib/api";
import { demoPage } from "@/lib/demo-workspace-queries";
import { invalidateWorkspaceRecords } from "@/lib/invalidate-workspace-records";
import { useContractPage, useWorkspaceOverview } from "@/lib/workspace-query-hooks";
import type { WorkspaceOverview } from "@/lib/api/workspace-queries";
import { contractFixture } from "@/test/agent-fixtures";
import { demoTasksFor } from "@/lib/demo-data";
import { ContractList } from "./contract-list";
import { ContractPicker } from "./contract-picker";
import { TaskList } from "./task-list";

vi.mock("@/lib/api", () => ({ api: { queryContracts: vi.fn(), queryOverview: vi.fn(), updateTask: vi.fn() } }));
vi.mock("./workspace-provider", () => ({ useWorkspace: () => ({ activeOrganization: { id: "org-1" }, canUpload: true }) }));
const rows = Array.from({ length: 76 }, (_, index) => ({ ...contractFixture, id: `contract-${index}`, title: `Agreement ${String(index).padStart(3, "0")}`, status: index < 50 ? "ready" : "reviewed", updated_at: new Date(2026, 0, index + 1).toISOString() }));
beforeEach(() => {
  vi.mocked(api.queryContracts).mockReset().mockImplementation(async (id, filters) => demoPage(rows.map((row) => ({ ...row, organization_id: id })), filters ?? {}, "updated_at", true));
  vi.mocked(api.queryOverview).mockReset(); vi.mocked(api.updateTask).mockReset();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}
function Register({ id = "org-1" }: { id?: string }) {
  const [status, setStatus] = useState<string | undefined>();
  const query = useContractPage(id, { status });
  return <><button onClick={() => setStatus("ready")}>Only ready</button>{query.isPending ? <p>Loading page</p> : <ContractList contracts={query.data?.items ?? []} paging={{ total: query.data?.total ?? 0, offset: query.offset, limit: 25, onOffsetChange: query.setOffset, sort: query.sort, onSortChange: query.setSort }} />}</>;
}

it("renders every server page row, sorts across the collection and resets page on filters/workspace", async () => {
  const { Wrapper } = setup(); const view = render(<Register />, { wrapper: Wrapper });
  await screen.findByText("Showing 1 to 25 of 76 entries");
  expect(screen.getAllByRole("row")).toHaveLength(26); // No second, local 10-row pagination.
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Showing 26 to 50 of 76 entries");
  fireEvent.click(screen.getByRole("button", { name: "Agreement" }));
  await screen.findByText("Showing 1 to 25 of 76 entries");
  expect(api.queryContracts).toHaveBeenLastCalledWith("org-1", expect.objectContaining({ offset: 0, sort: "title", descending: false }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(screen.getAllByRole("row")[1]).toHaveTextContent("Agreement 000");
  fireEvent.click(screen.getByRole("button", { name: "Next" })); await screen.findByText("Showing 26 to 50 of 76 entries");
  fireEvent.click(screen.getByRole("button", { name: "Only ready" })); await screen.findByText("Showing 1 to 25 of 50 entries");
  view.rerender(<Register id="org-2" />);
  await waitFor(() => expect(api.queryContracts).toHaveBeenLastCalledWith("org-2", expect.objectContaining({ offset: 0, status: "ready" }), expect.anything()));
});

it("can recover an empty out-of-range page after concurrent deletions", async () => {
  vi.mocked(api.queryContracts).mockImplementation(async (_id, filters) => filters?.offset ? { items: [], total: 5, offset: 25, limit: 25 } : { items: rows.slice(0, 5), total: 30, offset: 0, limit: 25 });
  const { Wrapper } = setup(); render(<Register />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  await screen.findByText("Showing 0 to 0 of 5 entries");
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  await screen.findByText("Showing 1 to 25 of 30 entries");
});

it("finds and preserves explicit older selections across picker pages", async () => {
  const { Wrapper } = setup(); const view = render(<form aria-label="Scope"><ContractPicker organizationId="org-1" id="scope" name="contract_ids" multiple retainedOnly /></form>, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("checkbox", { name: /Agreement 000/ }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: /Agreement 025/ }));
  expect(new FormData(screen.getByRole("form", { name: "Scope" }) as HTMLFormElement).getAll("contract_ids")).toEqual(expect.arrayContaining(["contract-0", "contract-25"]));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Agreement 075" } });
  fireEvent.click(await screen.findByRole("checkbox", { name: /Agreement 075/ }));
  expect(new FormData(screen.getByRole("form", { name: "Scope" }) as HTMLFormElement).getAll("contract_ids")).toHaveLength(3);
  view.rerender(<form aria-label="Scope"><ContractPicker organizationId="org-2" id="scope" name="contract_ids" multiple retainedOnly /></form>);
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(new FormData(screen.getByRole("form", { name: "Scope" }) as HTMLFormElement).getAll("contract_ids")).toEqual([]);
});

it("refreshes aggregate counts after a task mutation, not just the paginated task cache", async () => {
  const task = { ...demoTasksFor(null)[0], organization_id: "org-1", status: "open" as const };
  const overview = (active: number) => ({ counts: { contracts: 1000, active_tasks: active, processing: 0 }, my_tasks: active ? [task] : [] }) as WorkspaceOverview;
  vi.mocked(api.queryOverview).mockResolvedValueOnce(overview(1000)).mockResolvedValue(overview(999));
  vi.mocked(api.updateTask).mockResolvedValue({ ...task, status: "done" });
  function Panel() { const query = useWorkspaceOverview("org-1"); return <><p>Active: {query.data?.counts.active_tasks}</p><TaskList tasks={query.data?.my_tasks ?? []} /></>; }
  const { Wrapper, client } = setup();
  client.setQueryData(["tasks", "org-1", "page", { offset: 50 }], { items: [], total: 1000 });
  render(<Panel />, { wrapper: Wrapper });
  await screen.findByText("Active: 1000"); fireEvent.click(screen.getByRole("button", { name: `Complete ${task.title}` }));
  await screen.findByText("Active: 999");
  expect(client.getQueryState(["tasks", "org-1", "page", { offset: 50 }])?.isInvalidated).toBe(true);
  expect(api.queryOverview).toHaveBeenCalledTimes(2);
});

it("invalidates all scoped pages, search and summary, but not another workspace", async () => {
  const { client } = setup();
  const keys = ["contracts", "tasks", "lifecycle", "overview", "workspace-search", "calendar-grid"];
  for (const root of keys) { client.setQueryData([root, "org-1", { offset: 25 }], "one"); client.setQueryData([root, "org-2", { offset: 25 }], "two"); }
  await act(async () => { await invalidateWorkspaceRecords(client, "org-1", "contracts", "tasks", "lifecycle"); });
  for (const root of keys) {
    expect(client.getQueryState([root, "org-1", { offset: 25 }])?.isInvalidated).toBe(true);
    expect(client.getQueryState([root, "org-2", { offset: 25 }])?.isInvalidated).toBe(false);
  }
});
