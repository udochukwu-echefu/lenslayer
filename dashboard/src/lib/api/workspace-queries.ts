import type { Contract, LifecycleItem, TaskCategory, WorkflowTask } from "../types";
import { isDemoWorkspace, PUBLIC_ACCESS_ENABLED } from "../workspace-mode";
import { request } from "./client";

export type QueryPage<T> = { items: T[]; total: number; offset: number; limit: number };
export type PageFilters = { limit?: number; offset?: number; q?: string; status?: string; descending?: boolean };
export type ContractFilters = PageFilters & { sort?: "updated_at" | "created_at" | "title" | "counterparty" | "contract_type" | "status" };
export type TaskFilters = PageFilters & { sort?: "due_at" | "created_at" | "title" | "status" | "priority"; assigned_to_user_id?: string; contract_id?: string; due_before?: string; due_after?: string; category?: TaskCategory };
export type LifecycleFilters = PageFilters & { sort?: "due_at" | "created_at" | "title" | "status" | "kind"; contract_id?: string; due_before?: string; due_after?: string };
export type SearchItem = { id: string; kind: "contract" | "task"; title: string; meta: string; href: string };
export type WorkspaceSearch = { items: SearchItem[]; query: string };
export type OverviewWindow = { day_start: string; week_end: string };
export type WorkspaceOverview = {
  counts: { contracts: number; ready: number; failed: number; processing: number; attention: number; active_tasks: number; completed_tasks: number; overdue_tasks: number; upcoming_tasks: number; upcoming_notice_deadlines: number; due_soon_tasks: number };
  recent_contracts: Contract[]; attention_contracts: Contract[]; my_tasks: WorkflowTask[];
  upcoming_tasks: WorkflowTask[]; upcoming_lifecycle: LifecycleItem[]; as_of: string;
};
export type QueryOptions = { signal?: AbortSignal; privateWorkspace?: boolean };

export function queryString(filters: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && !(key === "status" && value === "all")) params.set(key, String(value));
  }
  return params.toString();
}

async function query<T>(organizationId: string, resource: string, filters: object, options?: QueryOptions): Promise<T> {
  options?.signal?.throwIfAborted();
  // Synthetic data is an explicit demo-only adapter, never a private API fallback.
  if (!options?.privateWorkspace && PUBLIC_ACCESS_ENABLED && isDemoWorkspace(organizationId)) {
    const { demoWorkspaceQuery } = await import("../demo-workspace-queries");
    options?.signal?.throwIfAborted();
    return demoWorkspaceQuery(organizationId, resource, filters) as T;
  }
  return request<T>(`/organizations/${encodeURIComponent(organizationId)}/query/${resource}?${queryString(filters)}`, { signal: options?.signal }, false, options?.privateWorkspace ? "fresh" : undefined);
}

export const workspaceQueriesApi = {
  queryContracts: (id: string, filters: ContractFilters = {}, options?: QueryOptions) => query<QueryPage<Contract>>(id, "contracts", { limit: 25, offset: 0, ...filters }, options),
  queryTasks: (id: string, filters: TaskFilters = {}, options?: QueryOptions) => query<QueryPage<WorkflowTask>>(id, "tasks", { limit: 25, offset: 0, ...filters }, options),
  queryLifecycle: (id: string, filters: LifecycleFilters = {}, options?: QueryOptions) => query<QueryPage<LifecycleItem>>(id, "lifecycle", { limit: 25, offset: 0, ...filters }, options),
  searchWorkspace: (id: string, q: string, options?: QueryOptions) => query<WorkspaceSearch>(id, "search", { q, limit: 7 }, options),
  queryOverview: (id: string, window: OverviewWindow, options?: QueryOptions) => query<WorkspaceOverview>(id, "overview", window, options),
};
