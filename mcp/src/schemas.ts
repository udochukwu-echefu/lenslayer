import { z } from "zod";

export const id = z.string().trim().min(1).max(64);
const key = z.string().trim().min(1).max(128);
export const instant = z.iso.datetime({ offset: true });
export const tool = z.enum(["documents.retrieve", "workspace.tasks.create", "google_calendar.events.create"]);
export const success = z.strictObject({ type: z.literal("workspace_task_created"), contract_id: id, assigned_to_user_id: id, due_at: instant });
export const runInput = z.strictObject({
  idempotency_key: key, goal: z.string().trim().min(1).max(4000),
  contract_ids: z.array(id).min(1).max(100), allowed_tools: z.array(z.enum(["documents.retrieve", "workspace.tasks.create"])).min(1).max(2),
  max_actions: z.number().int().min(1).max(20).default(1), deadline_at: instant, success_condition: success,
});
export const evidenceInput = z.strictObject({ contract_id: id, query: z.string().trim().min(2).max(200), version_id: id.nullable().optional() });
export const taskInput = z.strictObject({
  condition_id: id.nullable().optional(),
  contract_id: id, assigned_to_user_id: id, title: z.string().trim().min(1).max(512),
  description: z.string().trim().max(4000).optional(), due_at: instant, evidence_id: id,
  deadline_basis: z.strictObject({ renewal_date: z.iso.date(), notice_days: z.number().int().min(0).max(3650) }).nullable().optional(),
});
export const actionInput = z.strictObject({ idempotency_key: key, tool: z.literal("workspace.tasks.create"), input: taskInput });

export const calendarTarget = z.strictObject({ connection_id: id, calendar_id: z.string().min(1).max(1024).regex(/^[^\s*]+$/) });
export const calendarSuccess = calendarTarget.extend({ type: z.literal("calendar_event_created"), summary: z.string().trim().min(1).max(512), start_at: instant, end_at: instant });
const intervalValid = (a: { start_at: string; end_at: string }) => Date.parse(a.end_at) > Date.parse(a.start_at) && Date.parse(a.end_at) - Date.parse(a.start_at) <= 31 * 86400000;
export const calendarInput = calendarSuccess.extend({ condition_id: id.nullable().optional(), description: z.string().trim().max(4000).optional(), contract_id: id.nullable().optional(), evidence_id: id.nullable().optional() }).refine(intervalValid).refine((a) => Boolean(a.contract_id) === Boolean(a.evidence_id));
export const calendarAction = z.strictObject({ idempotency_key: key, tool: z.literal("google_calendar.events.create"), tool_version: z.literal("1").default("1"), input: calendarInput });
export const workflowTaskAction = actionInput.extend({ tool_version: z.literal("1").default("1") });

export function workflowInputFor(taskAllowed: boolean, calendarAllowed: boolean, retrieveAllowed = taskAllowed) {
  const variants: z.ZodType[] = [];
  if (taskAllowed) variants.push(success);
  if (calendarAllowed) variants.push(calendarSuccess.refine(intervalValid));
  const single = variants.length === 1 ? variants[0] : z.union(variants);
  const composite = z.strictObject({ type: z.literal("all"), conditions: z.array(z.strictObject({ id, condition: single })).min(1).max(20) }).refine((a) => new Set(a.conditions.map((c) => c.id)).size === a.conditions.length);
  const allowedNames = [...(retrieveAllowed ? ["documents.retrieve"] : []), ...(taskAllowed ? ["workspace.tasks.create"] : []), ...(calendarAllowed ? ["google_calendar.events.create"] : [])];
  return runInput.extend({ contract_ids: z.array(id).max(100).default([]), calendar_targets: z.array(calendarTarget).max(100).default([]), allowed_tools: z.array(z.enum(allowedNames as [string, ...string[]])).min(1).max(3), success_condition: z.union([single, composite]) });
}
export const inputRequest = z.strictObject({
  idempotency_key: key, reason: z.string().trim().min(1).max(1000), expires_at: instant,
  responder: z.enum(["human", "agent"]).default("human"),
  fields: z.array(z.strictObject({ name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/).refine((name) => !/token|secret|password|credential/.test(name)), type: z.enum(["text", "date_time", "integer", "boolean"]), prompt: z.string().trim().min(1).max(512) })).min(1).max(20),
}).refine((a) => new Set(a.fields.map((f) => f.name)).size === a.fields.length);
export const inputSupply = z.strictObject({ values: z.record(z.string().min(1).max(64), z.union([z.string().max(4000), z.number().int().min(-2147483648).max(2147483647), z.boolean()])).refine((a) => Object.keys(a).length >= 1 && Object.keys(a).length <= 20) });
