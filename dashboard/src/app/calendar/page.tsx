"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import type { LifecycleItem, WorkflowTask } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/utils";

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const { activeOrganization, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const [month, setMonth] = useState(() => { const value = new Date(); value.setDate(1); value.setHours(12, 0, 0, 0); return value; });
  const tasksQuery = useQuery({ queryKey: ["tasks", organizationId], queryFn: () => api.tasks(organizationId), enabled: Boolean(organizationId) });
  const lifecycleQuery = useQuery({ queryKey: ["lifecycle", organizationId], queryFn: () => api.lifecycle(organizationId, { status: "active" }), enabled: Boolean(organizationId) });
  const dueTasks = useMemo(() => (tasksQuery.data ?? []).filter((task) => task.due_at && task.status !== "cancelled"), [tasksQuery.data]);
  const lifecycleItems = useMemo(() => lifecycleQuery.data ?? [], [lifecycleQuery.data]);
  const calendar = useMemo(() => {
    const first = new Date(month);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);
  const tasksByDay = useMemo(() => dueTasks.reduce<Record<string, WorkflowTask[]>>((grouped, task) => {
    const key = dateKey(new Date(task.due_at!));
    grouped[key] = [...(grouped[key] ?? []), task];
    return grouped;
  }, {}), [dueTasks]);
  const lifecycleByDay = useMemo(() => lifecycleItems.reduce<Record<string, LifecycleItem[]>>((grouped, item) => {
    const key = dateKey(new Date(item.due_at));
    grouped[key] = [...(grouped[key] ?? []), item];
    return grouped;
  }, {}), [lifecycleItems]);
  const monthTasks = dueTasks.filter((task) => { const due = new Date(task.due_at!); return due.getMonth() === month.getMonth() && due.getFullYear() === month.getFullYear(); });
  const monthLifecycle = lifecycleItems.filter((item) => { const due = new Date(item.due_at); return due.getMonth() === month.getMonth() && due.getFullYear() === month.getFullYear(); });
  const today = dateKey(new Date());

  function moveMonth(amount: number) {
    setMonth((value) => new Date(value.getFullYear(), value.getMonth() + amount, 1, 12));
  }

  const loading = tasksQuery.isLoading || lifecycleQuery.isLoading;
  const error = tasksQuery.error || lifecycleQuery.error;
  return <div className="page calendar-page"><div className="page-heading"><div><p className="eyebrow">Contract operations calendar</p><h1 className="page-title">Calendar</h1><p className="page-description">Tasks, renewals, notice windows, obligations, and payment reminders in one verified timeline.</p></div><div className="page-heading-actions"><a className="button secondary" href={api.calendarExportUrl(organizationId)} download><Download size={15} />Export calendar</a>{canUpload && <Link className="button" href="/tasks?new=1"><Plus size={16} />New task</Link>}</div></div>
    <div className="calendar-toolbar"><div><button className="icon-button" type="button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button><button className="button ghost" type="button" onClick={() => { const value = new Date(); value.setDate(1); setMonth(value); }}>Today</button><button className="icon-button" type="button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button></div><h2>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month)}</h2><span>{monthTasks.length + monthLifecycle.length} dated items</span></div>
    {loading ? <PageLoading rows={7} /> : error ? <PageError error={error} /> : <><section className="calendar-grid" aria-label={`${new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month)} contract calendar`}>{weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{calendar.map((day) => { const key = dateKey(day); const tasks = tasksByDay[key] ?? []; const lifecycle = lifecycleByDay[key] ?? []; const items = [...tasks.map((task) => ({ id: task.id, label: task.title, href: task.contract_id ? `/contracts/${task.contract_id}?tab=actions` : "/tasks", className: `calendar-task ${task.priority} ${task.status === "done" ? "done" : ""}` })), ...lifecycle.map((item) => ({ id: item.id, label: item.title, href: `/contracts/${item.contract_id}?tab=lifecycle`, className: `calendar-task lifecycle ${item.kind} ${item.escalated_at ? "escalated" : ""}` }))]; const outside = day.getMonth() !== month.getMonth(); return <div className={`calendar-day ${outside ? "outside" : ""} ${key === today ? "today" : ""}`} key={key}><time dateTime={key}>{day.getDate()}</time><div>{items.slice(0,3).map((item) => <Link className={item.className} href={item.href} key={item.id}>{item.label}</Link>)}{items.length > 3 && <span className="calendar-more">+{items.length - 3} more</span>}</div></div>; })}</section><section className="calendar-agenda"><div className="section-heading"><h2>{new Intl.DateTimeFormat("en", { month: "long" }).format(month)} agenda</h2><p>{monthTasks.length + monthLifecycle.length} dated</p></div>{monthTasks.length + monthLifecycle.length ? [...monthTasks.map((task) => ({ id: task.id, dueAt: task.due_at!, title: task.title, subtitle: task.contract_title || "Workspace action", label: task.priority, href: task.contract_id ? `/contracts/${task.contract_id}?tab=actions` : "/tasks" })), ...monthLifecycle.map((item) => ({ id: item.id, dueAt: item.due_at, title: item.title, subtitle: item.contract_title, label: titleCase(item.kind), href: `/contracts/${item.contract_id}?tab=lifecycle` }))].sort((a,b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()).map((item) => <Link href={item.href} key={item.id}><time>{formatDate(item.dueAt, { weekday: "short", day: "numeric", month: "short" })}</time><div><strong>{item.title}</strong><span>{item.subtitle}</span></div><span className="task-priority normal">{item.label}</span></Link>) : <div className="task-empty"><CalendarDays size={16} /><p>No dated items this month.</p></div>}</section></>}
  </div>;
}
