import type { WorkflowTask } from "./types";

/** Never infer a contract/context ID from a title, task ID or a null contract. */
export function taskSource(task: WorkflowTask): { href: string; label: string } | null {
  if (task.contract_id) return { href: `/contracts/${encodeURIComponent(task.contract_id)}`, label: task.contract_title || "Contract source" };
  const id = task.source_reference?.context_id;
  return typeof id === "string" && id.trim() ? { href: `/context/${encodeURIComponent(id)}`, label: "Workspace context" } : null;
}
