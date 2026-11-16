import { useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { CalendarWindow, ContractFilters, LifecycleFilters, OverviewWindow, QueryPage, TaskFilters } from "./api/query-types";

/**
 * Data hooks shared by screens. Query keys match the dashboard
 * (dashboard/src/lib/workspace-query-hooks.ts) so invalidation reads the same.
 * Lists use infinite queries: the phone loads 25 rows, then the next 25 when
 * you scroll to the end, instead of the web's numbered pages.
 */
export const PAGE_SIZE = 25;
const MOVING = ["queued", "processing", "running"];

export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return debounced;
}

export function overviewWindow(now = new Date()): OverviewWindow {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 7);
  return { day_start: start.toISOString(), week_end: end.toISOString() };
}

const nextOffset = <T,>(page: QueryPage<T>) => (page.offset + page.items.length < page.total ? page.offset + page.items.length : undefined);

export function useOverview(organizationId: string) {
  const [window] = useState(() => overviewWindow());
  return useQuery({
    queryKey: ["overview", organizationId, window],
    queryFn: ({ signal }) => api.queryOverview(organizationId, window, { signal }),
    enabled: Boolean(organizationId),
    refetchInterval: (query) => (query.state.data?.counts.processing ? 5000 : false),
  });
}

export function useTaskCounts(organizationId: string) {
  const [window] = useState(() => overviewWindow());
  return useQuery({
    queryKey: ["tasks", organizationId, "counts", window.day_start],
    queryFn: ({ signal }) => api.queryTaskCounts(organizationId, window.day_start, { signal }),
    enabled: Boolean(organizationId),
  });
}

export function useCalendarGrid(organizationId: string, window: CalendarWindow) {
  return useQuery({ queryKey: ["calendar-grid", organizationId, window], queryFn: ({ signal }) => api.queryCalendar(organizationId, window, { signal }), enabled: Boolean(organizationId) });
}

export function useContractList(organizationId: string, filters: ContractFilters = {}, refreshProcessing = false) {
  const params = { sort: "updated_at" as const, descending: true, ...filters, limit: PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: ["contracts", organizationId, "list", params],
    queryFn: ({ pageParam, signal }) => api.queryContracts(organizationId, { ...params, offset: pageParam }, { signal }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled: Boolean(organizationId),
    refetchInterval: refreshProcessing ? (query) => (query.state.data?.pages.some((page) => page.items.some((item) => MOVING.includes(item.status))) ? 5000 : false) : false,
  });
}

export function useTaskList(organizationId: string, filters: TaskFilters = {}, enabled = true) {
  const params = { ...filters, limit: PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: ["tasks", organizationId, "list", params],
    queryFn: ({ pageParam, signal }) => api.queryTasks(organizationId, { ...params, offset: pageParam }, { signal }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled: Boolean(organizationId) && enabled,
  });
}

export function useLifecycleList(organizationId: string, filters: LifecycleFilters = {}) {
  const params = { ...filters, limit: PAGE_SIZE };
  return useInfiniteQuery({
    queryKey: ["lifecycle", organizationId, "list", params],
    queryFn: ({ pageParam, signal }) => api.queryLifecycle(organizationId, { ...params, offset: pageParam }, { signal }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled: Boolean(organizationId),
  });
}

export function useMembers(organizationId: string) {
  return useQuery({ queryKey: ["members", organizationId], queryFn: ({ signal }) => api.members(organizationId, { signal }), enabled: Boolean(organizationId) });
}

export function useNotifications(organizationId: string) {
  return useQuery({ queryKey: ["notifications", organizationId], queryFn: () => api.notifications(organizationId), enabled: Boolean(organizationId), refetchInterval: 30_000 });
}

/** Flattens infinite-query pages into one array plus the server's total. */
export function flatten<T>(data: { pages: QueryPage<T>[] } | undefined) {
  return { items: data?.pages.flatMap((page) => page.items) ?? [], total: data?.pages[0]?.total ?? 0 };
}

/** After a write, refresh every list and summary that could show the changed record. */
export function invalidateWorkspaceRecords(client: QueryClient, organizationId: string, ...roots: ("contracts" | "tasks" | "lifecycle")[]) {
  return Promise.all([...new Set([...roots, "overview", "workspace-search", "calendar-grid", "deal-passport"])].map((root) => client.invalidateQueries({ queryKey: [root, organizationId] })));
}
