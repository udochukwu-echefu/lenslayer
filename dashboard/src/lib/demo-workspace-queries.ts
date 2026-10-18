import { getDemoResponse } from "./demo-data";
import type { Contract, LifecycleItem, WorkflowTask } from "./types";
import type { CalendarGrid, CalendarWindow, OverviewWindow, PageFilters, QueryPage, WorkspaceOverview } from "./api/workspace-queries";

type Filters = PageFilters & { sort?: string; contract_id?: string; assigned_to_user_id?: string; category?: string; due_before?: string; due_after?: string };
type Row = { id: string; status: string; title: string };
const timestamp = (value: string) => Date.parse(value.length === 10 ? `${value}T00:00:00` : value);

export function demoPage<T extends Row>(rows: T[], filters: Filters, defaultSort: string, defaultDescending = false): QueryPage<T> {
  const { q = "", status, sort = defaultSort, descending = defaultDescending, offset = 0, limit = 25 } = filters;
  const term = q.trim().toLowerCase();
  const field = (row: T, key: string): unknown => (row as Record<string, unknown>)[key];
  const filtered = rows.filter((row) => {
    if (status && status !== "all" && !status.split(",").includes(row.status)) return false;
    for (const key of ["contract_id", "assigned_to_user_id", "category"] as const) if (filters[key] && field(row, key) !== filters[key]) return false;
    const due = field(row, "due_at") as string | null;
    if (filters.due_before && (!due || (filters.due_before_exclusive ? timestamp(due) >= timestamp(filters.due_before) : timestamp(due) > timestamp(filters.due_before)))) return false;
    if (filters.due_after && (!due || timestamp(due) < timestamp(filters.due_after))) return false;
    return !term || ["title", "source_name", "counterparty", "contract_type", "status", "contract_title", "assigned_to_name", "due_at", "kind"].some((key) => String(field(row, key) ?? "").toLowerCase().includes(term));
  }).sort((a, b) => {
    const left = field(a, sort), right = field(b, sort);
    if (left == null || right == null) return left == null && right == null ? a.id.localeCompare(b.id) : left == null ? 1 : -1;
    const order = String(left).localeCompare(String(right));
    return (descending ? -order : order) || a.id.localeCompare(b.id);
  });
  return { items: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit };
}

export function demoWorkspaceQuery(id: string, resource: string, filters: object) {
  const collection = <T,>(name: string): T[] => {
    const response = getDemoResponse(`/organizations/${id}/${name}`);
    if (!response.handled || !("value" in response) || !Array.isArray(response.value)) throw new Error("Demo collection unavailable");
    return response.value as T[];
  };
  if (resource === "contracts") return demoPage(collection<Contract>("contracts"), filters, "updated_at", true);
  if (resource === "tasks") return demoPage(collection<WorkflowTask>("tasks"), filters, "due_at");
  if (resource === "lifecycle") return demoPage(collection<LifecycleItem>("lifecycle"), filters, "due_at");
  if (resource === "calendar") {
    const { month, grid_start, timezone } = filters as CalendarWindow;
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const items = [
      ...collection<WorkflowTask>("tasks").filter((row) => row.due_at && ["open", "in_progress", "done"].includes(row.status)).map((row) => ({ id: row.id, title: row.title, contract_id: row.contract_id, due_at: row.due_at!, kind: "task" as const, category: row.priority, status: row.status, escalated: false })),
      ...collection<LifecycleItem>("lifecycle").filter((row) => row.status === "active").map((row) => ({ id: row.id, title: row.title, contract_id: row.contract_id, due_at: row.due_at, kind: "lifecycle" as const, category: row.kind, status: row.status, escalated: Boolean(row.escalated_at) })),
    ].sort((a, b) => timestamp(a.due_at) - timestamp(b.due_at) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
    const days = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(`${grid_start}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + i);
      const key = date.toISOString().slice(0, 10);
      const rows = items.filter((item) => formatter.format(new Date(item.due_at)) === key);
      return { date: key, total: rows.length, items: rows.slice(0, 3) };
    });
    return { days, month_total: days.filter((day) => day.date.slice(0, 7) === month.slice(0, 7)).reduce((n, day) => n + day.total, 0), grid_total: days.reduce((n, day) => n + day.total, 0), timezone } satisfies CalendarGrid;
  }
  const contracts = collection<Contract>("contracts"), tasks = collection<WorkflowTask>("tasks");
  if (resource === "search") {
    const { q, limit = 7 } = filters as { q: string; limit?: number };
    return { query: q, items: [
      ...demoPage(contracts, { q, limit: 20 }, "updated_at", true).items.map((item) => ({ id: item.id, kind: "contract", title: item.title, meta: `${item.counterparty} · ${item.status}`, href: `/contracts/${item.id}` })),
      ...demoPage(tasks, { q, limit: 20 }, "due_at").items.map((item) => ({ id: item.id, kind: "task", title: item.title, meta: `${item.contract_title ?? "Workspace action"} · task`, href: "/tasks" })),
    ].slice(0, limit) };
  }
  if (resource !== "overview") throw new Error("Unknown demo query");
  const { day_start, week_end } = filters as OverviewWindow;
  const active = tasks.filter((task) => ["open", "in_progress"].includes(task.status));
  const overdue = active.filter((task) => task.due_at && timestamp(task.due_at) < timestamp(day_start));
  const upcoming = demoPage(active, { due_after: day_start, limit: 100 }, "due_at");
  const lifecycle = collection<LifecycleItem>("lifecycle");
  const dates = demoPage(lifecycle, { status: "active", due_after: day_start, limit: 100 }, "due_at");
  return {
    counts: {
      contracts: contracts.length, ready: contracts.filter((item) => item.status === "ready").length,
      failed: contracts.filter((item) => item.status === "failed").length,
      processing: contracts.filter((item) => ["queued", "processing", "running"].includes(item.status)).length,
      attention: contracts.filter((item) => ["ready", "failed"].includes(item.status)).length,
      active_tasks: active.length, completed_tasks: tasks.filter((item) => item.status === "done").length,
      overdue_tasks: overdue.length, upcoming_tasks: upcoming.total,
      upcoming_notice_deadlines: lifecycle.filter((item) => item.status === "active" && ["notice", "renewal"].includes(item.kind) && timestamp(item.due_at) >= timestamp(day_start)).length,
      due_soon_tasks: demoPage(active, { due_after: day_start, due_before: week_end, due_before_exclusive: true }, "due_at").total,
    },
    recent_contracts: demoPage(contracts, { limit: 5 }, "updated_at", true).items,
    attention_contracts: demoPage(contracts, { status: "ready,failed", limit: 5 }, "updated_at", true).items,
    my_tasks: demoPage(active, { limit: 5 }, "due_at").items,
    upcoming_tasks: upcoming.items.slice(0, 4), upcoming_lifecycle: dates.items.slice(0, 4), as_of: new Date().toISOString(),
  } satisfies WorkspaceOverview;
}
