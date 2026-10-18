import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { WorkspaceSearch as SearchResponse } from "@/lib/api/workspace-queries";
import { WorkspaceSearch } from "./workspace-search";

vi.mock("@/lib/api", () => ({ api: { searchWorkspace: vi.fn() } }));
beforeEach(() => { vi.useFakeTimers(); vi.mocked(api.searchWorkspace).mockReset(); });
afterEach(() => vi.useRealTimers());
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const show = (id: string) => <QueryClientProvider client={client}><WorkspaceSearch organizationId={id} /></QueryClientProvider>;
  return { client, show };
}
async function advance() {
  await act(async () => { await vi.advanceTimersByTimeAsync(260); });
  // React enables the debounced query at the end of the first act. Flush the
  // query notification scheduled after that render, not an arbitrary sleep.
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}
const result = (title: string): SearchResponse => ({ query: title, items: [{ id: title, title, kind: "contract", meta: "Safe metadata", href: "/contracts/synthetic" }] });

it("keeps search visible on an empty workspace and debounces without eager collection calls", async () => {
  vi.mocked(api.searchWorkspace).mockResolvedValue({ items: [], query: "nothing" });
  const { show } = setup(); render(show("org-1"));
  const input = screen.getByRole("textbox", { name: "Global search" });
  expect(input).toBeInTheDocument(); expect(api.searchWorkspace).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "n" } }); await advance(); expect(api.searchWorkspace).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "no" } });
  fireEvent.change(input, { target: { value: "nothing" } });
  expect(api.searchWorkspace).not.toHaveBeenCalled(); await advance();
  expect(api.searchWorkspace).toHaveBeenCalledTimes(1);
  expect(api.searchWorkspace).toHaveBeenCalledWith("org-1", "nothing", { signal: expect.any(AbortSignal) });
  expect(screen.getByText("No workspace records match this search.")).toBeInTheDocument();
});

it("cancels superseded searches and rejects a late older response", async () => {
  const requests: Array<{ signal: AbortSignal; resolve: (data: SearchResponse) => void }> = [];
  vi.mocked(api.searchWorkspace).mockImplementation((_id, _q, options) => new Promise((resolve) => requests.push({ signal: options!.signal!, resolve })));
  const { show } = setup(); render(show("org-1"));
  const input = screen.getByRole("textbox", { name: "Global search" });
  fireEvent.change(input, { target: { value: "older" } }); await advance();
  fireEvent.change(input, { target: { value: "newer" } });
  expect(requests[0].signal.aborted).toBe(true); await advance();
  await act(async () => { requests[1].resolve(result("New result")); }); await advance();
  expect(screen.getByRole("link", { name: /New result/ })).toBeInTheDocument();
  await act(async () => { requests[0].resolve(result("Old result")); }); await advance();
  expect(screen.queryByRole("link", { name: /Old result/ })).not.toBeInTheDocument();
});

it("clears input, cached results and in-flight work on workspace switches", async () => {
  let oldSignal!: AbortSignal, resolveOld!: (response: SearchResponse) => void;
  vi.mocked(api.searchWorkspace).mockImplementation((_id, _q, options) => new Promise((resolve) => { oldSignal = options!.signal!; resolveOld = resolve; }));
  const { show } = setup(); const view = render(show("org-1"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "supplier" } }); await advance();
  view.rerender(show("org-2")); expect(oldSignal.aborted).toBe(true);
  expect(screen.getByRole("textbox")).toHaveValue("");
  await act(async () => { resolveOld(result("Private old workspace")); }); await advance();
  expect(screen.queryByText("Private old workspace")).not.toBeInTheDocument();
  expect(api.searchWorkspace).toHaveBeenCalledTimes(1);
});

it("supports mobile focus, Escape and retryable errors", async () => {
  vi.mocked(api.searchWorkspace).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(result("Recovered"));
  const { show } = setup(); render(show("org-1"));
  fireEvent.click(screen.getByRole("button", { name: "Search workspace" }));
  const input = screen.getByRole("textbox"); expect(input).toHaveFocus();
  fireEvent.change(input, { target: { value: "query" } }); await advance();
  expect(screen.getByRole("alert")).toHaveTextContent("Search could not load.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await advance();
  expect(screen.getByRole("link", { name: /Recovered/ })).toBeInTheDocument();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveValue(""); expect(screen.getByRole("button", { name: "Search workspace" })).toHaveFocus();
});
