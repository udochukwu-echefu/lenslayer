"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { ContractFilters, TaskFilters, LifecycleFilters, OverviewWindow } from "./api/workspace-queries";

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

export function useWorkspaceOverview(organizationId: string) {
  const [window] = useState(() => overviewWindow());
  return useQuery({ queryKey: ["overview", organizationId, window], queryFn: ({ signal }) => api.queryOverview(organizationId, window, { signal }), enabled: Boolean(organizationId), refetchInterval: (query) => query.state.data?.counts.processing ? 5000 : false });
}

function usePageState(organizationId: string, filters: object) {
  const identity = JSON.stringify([organizationId, filters]);
  const [page, setPage] = useState({ identity, offset: 0 });
  return { offset: page.identity === identity ? page.offset : 0, setOffset: (offset: number) => setPage({ identity, offset }) };
}

export function useContractPage(organizationId: string, filters: ContractFilters = {}, refreshProcessing = false) {
  const [sort, setSort] = useState<{ sort: NonNullable<ContractFilters["sort"]>; descending: boolean }>({ sort: "updated_at", descending: true });
  const options = { limit: 25, ...sort, ...filters };
  const page = usePageState(organizationId, options);
  const params = { ...options, offset: page.offset };
  const query = useQuery({ queryKey: ["contracts", organizationId, "page", params], queryFn: ({ signal }) => api.queryContracts(organizationId, params, { signal }), enabled: Boolean(organizationId), refetchInterval: refreshProcessing ? (query) => query.state.data?.items.some((item) => ["queued", "processing", "running"].includes(item.status)) ? 5000 : false : false });
  return { ...query, ...page, sort, setSort };
}

export function useTaskPage(organizationId: string, filters: TaskFilters = {}) {
  const page = usePageState(organizationId, filters);
  const params = { limit: 25, ...filters, offset: page.offset };
  const query = useQuery({ queryKey: ["tasks", organizationId, "page", params], queryFn: ({ signal }) => api.queryTasks(organizationId, params, { signal }), enabled: Boolean(organizationId) });
  return { ...query, ...page };
}

export function useLifecyclePage(organizationId: string, filters: LifecycleFilters = {}) {
  const page = usePageState(organizationId, filters);
  const params = { limit: 25, ...filters, offset: page.offset };
  const query = useQuery({ queryKey: ["lifecycle", organizationId, "page", params], queryFn: ({ signal }) => api.queryLifecycle(organizationId, params, { signal }), enabled: Boolean(organizationId) });
  return { ...query, ...page };
}
