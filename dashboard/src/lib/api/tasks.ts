import type {
  TaskCreate,
  TaskStatus,
  TaskUpdate,
  WorkflowTask,
} from "../types";
import { request, jsonRequest } from "./client";

export const tasksApi = {
  tasks: (
    organizationId: string,
    filters?: {
      taskStatus?: TaskStatus;
      assignedToUserId?: string;
      contractId?: string;
      dueBefore?: string;
      dueAfter?: string;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.taskStatus) params.set("task_status", filters.taskStatus);
    if (filters?.assignedToUserId)
      params.set("assigned_to_user_id", filters.assignedToUserId);
    if (filters?.contractId) params.set("contract_id", filters.contractId);
    if (filters?.dueBefore) params.set("due_before", filters.dueBefore);
    if (filters?.dueAfter) params.set("due_after", filters.dueAfter);
    const query = params.size ? `?${params.toString()}` : "";
    return request<WorkflowTask[]>(
      `/organizations/${organizationId}/tasks${query}`,
    );
  },
  createTask: (organizationId: string, payload: TaskCreate) =>
    jsonRequest<WorkflowTask>(
      `/organizations/${organizationId}/tasks`,
      "POST",
      payload,
    ),
  updateTask: (organizationId: string, taskId: string, payload: TaskUpdate) =>
    jsonRequest<WorkflowTask>(
      `/organizations/${organizationId}/tasks/${taskId}`,
      "PATCH",
      payload,
    ),
  deleteTask: (organizationId: string, taskId: string) =>
    request<void>(`/organizations/${organizationId}/tasks/${taskId}`, {
      method: "DELETE",
    }),
};
