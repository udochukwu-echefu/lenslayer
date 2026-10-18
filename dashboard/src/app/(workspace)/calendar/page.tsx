"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { useCalendarGrid, useLifecyclePage, useTaskPage } from "@/lib/workspace-query-hooks";
import { QueryPagination } from "@/components/ui/query-pagination";
import { formatDate, titleCase } from "@/lib/utils";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { activeOrganization, canUpload, isDemo } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const [month, setMonth] = useState(() => { const value = new Date(); value.setDate(1); value.setHours(12, 0, 0, 0); return value; });
  const due_after = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
  const due_before = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
  const [descending, setDescending] = useState(false);
  const tasksQuery = useTaskPage(organizationId, { status: "open,in_progress,done", due_after, due_before, due_before_exclusive: true, descending });
  const lifecycleQuery = useLifecyclePage(organizationId, { status: "active", due_after, due_before, due_before_exclusive: true, descending });
  const dueTasks = useMemo(() => tasksQuery.data?.items ?? [], [tasksQuery.data]);
  const lifecycleItems = useMemo(() => lifecycleQuery.data?.items ?? [], [lifecycleQuery.data]);
  const calendar = useMemo(() => {
    const first = new Date(month);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);
  const gridQuery = useCalendarGrid(organizationId, { month: dateKey(month), grid_start: dateKey(calendar[0]), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const gridByDay = new Map(gridQuery.data?.days.map((day) => [day.date, day]));
  const monthTasks = dueTasks.filter((task) => { const due = new Date(task.due_at!); return due.getMonth() === month.getMonth() && due.getFullYear() === month.getFullYear(); });
  const monthLifecycle = lifecycleItems.filter((item) => { const due = new Date(item.due_at); return due.getMonth() === month.getMonth() && due.getFullYear() === month.getFullYear(); });
  const today = dateKey(new Date());

  function moveMonth(amount: number) {
    setMonth((value) => new Date(value.getFullYear(), value.getMonth() + amount, 1, 12));
  }

  const loading = gridQuery.isLoading;
  const error = gridQuery.error;
  return <div className="page calendar-page"><div className="page-heading"><div><h1 className="page-title">Calendar</h1><p className="page-description">Human-confirmed tasks, renewals, notice windows, obligations, and payment dates.</p></div><div className="page-heading-actions">{!isDemo && <button className="button secondary" type="button" onClick={() => void api.downloadCalendarExport(organizationId)}><Download size={15} />Export calendar</button>}{canUpload && <Link className="button" href="/tasks?new=1"><Plus size={16} />New task</Link>}</div></div>
    <div className="calendar-toolbar"><div><button className="icon-button" type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button><button className="button ghost" type="button" onClick={() => { const value = new Date(); value.setDate(1); setMonth(value); }}>Today</button><button className="icon-button" type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button></div><h2>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month)}</h2><span>{gridQuery.data?.month_total ?? "—"} dated items</span></div>
    <button className="button secondary" type="button" onClick={() => setDescending((value) => !value)}>{descending ? "Latest dates first" : "Earliest dates first"}</button>
    {!loading && !error && <><p className="field-help">The grid shows all dated items, with up to three previews per day. Agenda details are paginated independently.</p><QueryPagination total={tasksQuery.data?.total ?? 0} offset={tasksQuery.offset} limit={25} onOffsetChange={tasksQuery.setOffset} label="Calendar tasks" /><QueryPagination total={lifecycleQuery.data?.total ?? 0} offset={lifecycleQuery.offset} limit={25} onOffsetChange={lifecycleQuery.setOffset} label="Calendar lifecycle dates" /></>}
    {loading ? <PageLoading rows={7} /> : error ? <PageError error={error} /> : <>
      <section className="calendar-grid" aria-label={`${new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month)} contract calendar`}>
        {weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
        {calendar.map((day) => {
          const key = dateKey(day), data = gridByDay.get(key);
          return <div className={`calendar-day ${day.getMonth() !== month.getMonth() ? "outside" : ""} ${key === today ? "today" : ""}`} key={key}>
            <time dateTime={key}>{day.getDate()}</time><div>
              {data?.items.map((item) => <Link key={`${item.kind}-${item.id}`} title={`${item.kind === "task" ? "Task" : titleCase(item.category)}: ${item.title}`}
                href={item.kind === "task" ? item.contract_id ? `/contracts/${item.contract_id}?tab=actions` : "/tasks" : `/contracts/${item.contract_id}?tab=lifecycle`}
                className={item.kind === "task" ? `calendar-task ${item.category} ${item.status === "done" ? "done" : ""}` : `calendar-task lifecycle ${item.category} ${item.escalated ? "escalated" : ""}`}>
                <span className="calendar-event-kind">{item.kind === "task" ? "Task" : titleCase(item.category)}</span><span>{item.title}</span>
              </Link>)}
              {data && data.total > data.items.length && <span className="calendar-more">+{data.total - data.items.length} more</span>}
            </div>
          </div>;
        })}
      </section>
      <section className="calendar-agenda"><div className="section-heading"><h2>{new Intl.DateTimeFormat("en", { month: "long" }).format(month)} agenda</h2><p>{monthTasks.length + monthLifecycle.length} shown on these pages</p></div>
        {tasksQuery.isLoading || lifecycleQuery.isLoading ? <PageLoading rows={4} /> : tasksQuery.error || lifecycleQuery.error ? <PageError error={(tasksQuery.error || lifecycleQuery.error)!} /> : monthTasks.length + monthLifecycle.length ? [
          ...monthTasks.map((task) => ({ id: `task-${task.id}`, dueAt: task.due_at!, title: task.title, subtitle: task.contract_title || "Workspace action", label: task.priority, href: task.contract_id ? `/contracts/${task.contract_id}?tab=actions` : "/tasks" })),
          ...monthLifecycle.map((item) => ({ id: `lifecycle-${item.id}`, dueAt: item.due_at, title: item.title, subtitle: item.contract_title, label: titleCase(item.kind), href: `/contracts/${item.contract_id}?tab=lifecycle` })),
        ].sort((a,b) => (new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()) * (descending ? -1 : 1)).map((item) => <Link href={item.href} key={item.id}><time dateTime={item.dueAt}>{formatDate(item.dueAt, { weekday: "short", day: "numeric", month: "short" })}</time><div><strong>{item.title}</strong><span>{item.subtitle}</span></div><span className="task-priority normal">{item.label}</span></Link>) : <div className="task-empty"><CalendarDays size={16} /><p>No dated items on these agenda pages.</p></div>}
      </section>
    </>}
  </div>;
}
