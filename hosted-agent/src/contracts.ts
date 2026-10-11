import { z } from "zod";

// Opaque metadata only: never accept source text or a credential as a handle.
const id = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).refine((value) => !/^(ll_agent_|sk-)/i.test(value));
export const instant = z.iso.datetime({ offset: true });
export const configSchema = z.strictObject({
  goal: z.string().max(200),
  runKey: z.string().min(1).max(128), actionKey: z.string().min(1).max(128),
  contractId: id.optional(), assigneeId: id.optional(), dueAt: instant.optional(), deadlineAt: instant.optional(),
  query: z.string().trim().min(2).max(200).default("renewal notice"), versionId: id.optional(),
  renewalDate: z.iso.date().optional(), noticeDays: z.number().int().min(0).max(3650).optional(),
  limits: z.strictObject({
    modelCalls: z.number().int().min(0).max(3).default(1),
    evidence: z.number().int().min(0).max(1).default(1), actions: z.number().int().min(0).max(1).default(1),
    timeMs: z.number().int().min(1).max(300000).default(60000),
    outputBytes: z.number().int().min(256).max(16384).default(4096),
  }).default({ modelCalls: 1, evidence: 1, actions: 1, timeMs: 60000, outputBytes: 4096 }),
});
export type RunnerConfig = z.infer<typeof configSchema>;
// No arbitrary text, URLs, tools, new assignees or execution commands in a plan.
export const planSchema = z.strictObject({
  decision: z.enum(["task", "needs_input", "unsupported"]),
  contract_id: id.nullable(), assigned_to_user_id: id.nullable(), due_at: instant.nullable(), evidence_id: id.nullable(),
  quote_start: z.number().int().min(0).max(16000).nullable(), quote_end: z.number().int().min(0).max(16000).nullable(),
  missing: z.array(z.enum(["contractId", "assigneeId", "dueAt", "deadlineAt", "renewalDate", "noticeDays", "source_context"])).max(7),
});
export type Plan = z.infer<typeof planSchema>;
export interface PlannerInput {
  goal: "retained-document-follow-up";
  facts: { contract_id: string; assigned_to_user_id: string; due_at: string; evidence_id: string };
  query: string;
  untrustedSource: { excerpt: string; version_id: string; source_sha256: string };
}
export interface Planner { plan(input: PlannerInput, signal: AbortSignal): Promise<unknown> }
export const checkpointSchema = z.strictObject({
  version: z.literal(1), binding: z.string().regex(/^[a-f0-9]{64}$/),
  runId: id.optional(), evidenceId: id.optional(), actionId: id.optional(),
  evidenceStarted: z.boolean().default(false), modelCalls: z.number().int().min(0).max(3).default(0),
  planningExpiresAt: z.number().optional(),
  proposalReady: z.boolean().default(false),
  phase: z.enum(["new", "awaiting_input", "planning", "awaiting_approval", "queued", "succeeded", "failed", "cancelled", "stopped"]).default("new"),
});
export type Checkpoint = z.infer<typeof checkpointSchema>;
export interface CheckpointStore {
  load(): Promise<Checkpoint | undefined>;
  save(state: Checkpoint): Promise<void>;
}
