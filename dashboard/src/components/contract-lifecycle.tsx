"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import type { LifecycleKind, Recurrence } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/utils";
import { AppSelect } from "./app-select";
import { PageError, PageLoading } from "./page-states";
import { useWorkspace } from "./workspace-provider";

export function ContractLifecycle({ contractId }: { contractId: string }) {
  const { activeOrganization, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<LifecycleKind>("renewal");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [amount, setAmount] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [reminderDays, setReminderDays] = useState(30);
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const lifecycleQuery = useQuery({ queryKey: ["lifecycle", organizationId, contractId], queryFn: () => api.lifecycle(organizationId, { contractId }), enabled: Boolean(organizationId) });
  const membersQuery = useQuery({ queryKey: ["members", organizationId], queryFn: () => api.members(organizationId), enabled: Boolean(organizationId) });
  const createMutation = useMutation({ mutationFn: () => api.createLifecycle(organizationId, contractId, { kind, title, due_at: new Date(dueAt).toISOString(), amount, owner_user_id: ownerUserId || null, reminder_days: reminderDays, recurrence }), onSuccess: async () => { setTitle(""); setDueAt(""); setAmount(""); await queryClient.invalidateQueries({ queryKey: ["lifecycle", organizationId] }); } });
  const updateMutation = useMutation({ mutationFn: ({ id, status }: { id: string; status: "completed" | "cancelled" }) => api.updateLifecycle(organizationId, id, { status }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lifecycle", organizationId] }) });
  if (lifecycleQuery.isLoading) return <PageLoading rows={6} />;
  if (lifecycleQuery.error) return <PageError error={lifecycleQuery.error} />;
  const items = lifecycleQuery.data ?? [];
  return <section className="lifecycle-workspace"><div className="content-heading"><div><p className="eyebrow">Post-signature operations</p><h2>Lifecycle and reminders</h2></div><p>Track renewals, notice windows, obligations, payments, and recurring follow-through.</p></div>
    {canUpload && <form className="lifecycle-form" onSubmit={(event: FormEvent) => { event.preventDefault(); createMutation.mutate(); }}><AppSelect value={kind} ariaLabel="Lifecycle type" onValueChange={(value) => setKind(value as LifecycleKind)} options={[{ value: "renewal", label: "Renewal" }, { value: "notice", label: "Notice period" }, { value: "obligation", label: "Obligation" }, { value: "payment", label: "Payment" }, { value: "post_signature", label: "Post-signature task" }]} /><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What must happen?" /><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} aria-label="Due date and time" />{kind === "payment" && <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount or payment reference" />}<AppSelect value={ownerUserId} ariaLabel="Lifecycle owner" onValueChange={setOwnerUserId} options={[{ value: "", label: "Unassigned" }, ...(membersQuery.data ?? []).map((member) => ({ value: member.user_id, label: member.display_name || member.email }))]} /><AppSelect value={String(reminderDays)} ariaLabel="Reminder lead time" onValueChange={(value) => setReminderDays(Number(value))} options={[{ value: "0", label: "At due time" }, { value: "1", label: "1 day before" }, { value: "7", label: "7 days before" }, { value: "14", label: "14 days before" }, { value: "30", label: "30 days before" }, { value: "60", label: "60 days before" }, { value: "90", label: "90 days before" }]} /><AppSelect value={recurrence} ariaLabel="Recurrence" onValueChange={(value) => setRecurrence(value as Recurrence)} options={[{ value: "none", label: "Does not repeat" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "yearly", label: "Yearly" }]} /><button className="button" disabled={title.trim().length < 2 || !dueAt || createMutation.isPending}><Plus size={14} />Add lifecycle item</button></form>}
    {createMutation.error && <p className="form-error">{createMutation.error.message}</p>}
    <div className="lifecycle-list">{items.length ? items.map((item) => <article key={item.id} className={item.status}><span className={`lifecycle-kind ${item.kind}`}><CalendarClock size={16} /></span><div><div><strong>{item.title}</strong><span className={`pill ${item.escalated_at ? "high" : item.status === "completed" ? "low" : "medium"}`}>{item.escalated_at ? "Escalated" : titleCase(item.status)}</span></div><p>{titleCase(item.kind)} · Due {formatDate(item.due_at)}{item.amount ? ` · ${item.amount}` : ""}</p><small>Reminder {item.reminder_days} days before{item.recurrence !== "none" ? ` · Repeats ${item.recurrence}` : ""}{item.owner_name ? ` · ${item.owner_name}` : ""}</small></div>{item.status === "active" && canUpload && <div className="lifecycle-actions"><button onClick={() => updateMutation.mutate({ id: item.id, status: "completed" })}><CheckCircle2 size={14} />Complete</button><button onClick={() => updateMutation.mutate({ id: item.id, status: "cancelled" })}>Cancel</button></div>}</article>) : <div className="quiet-panel"><CheckCircle2 size={18} /><p>No lifecycle items yet. Add the first verified date or post-signature obligation.</p></div>}</div>
  </section>;
}
