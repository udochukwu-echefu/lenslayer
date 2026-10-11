import type { HostedAgentCapabilities, HostedAgentTask, HostedAgentTaskCreate } from "../hosted-agent-types";
import { isDemoWorkspace } from "../workspace-mode";
import { ApiError, request } from "./client";

function organizationPath(org: string) {
  if (isDemoWorkspace(org)) throw new ApiError("Synthetic preview is read-only. No hosted agent is assigned or executed here.", 403);
  return `/organizations/${encodeURIComponent(org)}`;
}
const taskPath = (org: string, id: string) => `${organizationPath(org)}/hosted-agent-tasks/${encodeURIComponent(id)}`;
function scopedTask(task: HostedAgentTask, org: string, id?: string) {
  if (!task || task.organization_id !== org || (id !== undefined && task.id !== id))
    throw new ApiError("Assignment response did not match the selected workspace or task. No foreign record was displayed.", 502);
  return task;
}
export const hostedAgentsApi = {
  hostedAgentCapabilities: (org: string, signal?: AbortSignal) => request<HostedAgentCapabilities>(`${organizationPath(org)}/hosted-agent-capabilities`, { signal }, false, "fresh"),
  hostedAgentTasks: (org: string, limit = 50, signal?: AbortSignal) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError("Choose a task list limit between 1 and 100.", 422);
    return request<HostedAgentTask[]>(`${organizationPath(org)}/hosted-agent-tasks?limit=${limit}`, { signal }, false, "fresh").then((tasks) => {
      if (!Array.isArray(tasks)) throw new ApiError("Assignment list could not be confirmed.", 502);
      return tasks.map((task) => scopedTask(task, org));
    });
  },
  hostedAgentTask: (org: string, id: string, signal?: AbortSignal) => request<HostedAgentTask>(taskPath(org, id), { signal }, false, "fresh").then((task) => scopedTask(task, org, id)),
  createHostedAgentTask: (org: string, input: HostedAgentTaskCreate, signal?: AbortSignal) => request<HostedAgentTask>(`${organizationPath(org)}/hosted-agent-tasks`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
  }, false, "fresh").then((task) => scopedTask(task, org)),
  cancelHostedAgentTask: (org: string, id: string, signal?: AbortSignal) => request<HostedAgentTask>(`${taskPath(org, id)}/cancel`, { method: "POST", signal }, false, "fresh").then((task) => scopedTask(task, org, id)),
};
