import type { Contract, LifecycleItem, TaskCategory, WorkflowTask } from "../shared/types";

/** Mirrors dashboard/src/lib/api/workspace-queries.ts (bounded server-side query API). */
export type QueryPage<T> = { items: T[]; total: number; offset: number; limit: number };
export type PageFilters = { limit?: number; offset?: number; q?: string; status?: string; descending?: boolean; due_before_exclusive?: boolean };
export type ContractFilters = PageFilters & { sort?: "updated_at" | "created_at" | "title" | "counterparty" | "contract_type" | "status" };
export type TaskFilters = PageFilters & { sort?: "due_at" | "created_at" | "title" | "status" | "priority"; assigned_to_user_id?: string; contract_id?: string; due_before?: string; due_after?: string; category?: TaskCategory };
export type LifecycleFilters = PageFilters & { sort?: "due_at" | "created_at" | "title" | "status" | "kind"; contract_id?: string; due_before?: string; due_after?: string };
export type SearchItem = { id: string; kind: "contract" | "task"; title: string; meta: string; href: string };
export type WorkspaceSearch = { items: SearchItem[]; query: string };
export type OverviewWindow = { day_start: string; week_end: string };
export type CalendarWindow = { month: string; grid_start: string; timezone: string };
export type CalendarGrid = {
  days: { date: string; total: number; items: { id: string; title: string; contract_id: string | null; due_at: string; kind: "task" | "lifecycle"; category: string; status: string; escalated: boolean }[] }[];
  month_total: number;
  grid_total: number;
  timezone: string;
};
export type WorkspaceOverview = {
  counts: { contracts: number; ready: number; failed: number; processing: number; attention: number; active_tasks: number; completed_tasks: number; overdue_tasks: number; upcoming_tasks: number; upcoming_notice_deadlines: number; due_soon_tasks: number };
  recent_contracts: Contract[];
  attention_contracts: Contract[];
  my_tasks: WorkflowTask[];
  upcoming_tasks: WorkflowTask[];
  upcoming_lifecycle: LifecycleItem[];
  as_of: string;
};
