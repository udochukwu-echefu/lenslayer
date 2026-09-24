import type { LifecycleItem, LifecycleKind, Recurrence } from "../types";
import { request, jsonRequest, download, API_PREFIX } from "./client";

export const lifecycleApi = {
  lifecycle: (
    organizationId: string,
    filters?: {
      contractId?: string;
      status?: string;
    },
  ) => {
    const params = new URLSearchParams();
    if (filters?.contractId) params.set("contract_id", filters.contractId);
    if (filters?.status) params.set("lifecycle_status", filters.status);
    return request<LifecycleItem[]>(
      `/organizations/${organizationId}/lifecycle${params.size ? `?${params}` : ""}`,
    );
  },
  createLifecycle: (
    organizationId: string,
    contractId: string,
    payload: {
      kind: LifecycleKind;
      title: string;
      description?: string;
      amount?: string;
      due_at: string;
      owner_user_id?: string | null;
      reminder_days?: number;
      recurrence?: Recurrence;
    },
  ) =>
    jsonRequest<LifecycleItem>(
      `/organizations/${organizationId}/contracts/${contractId}/lifecycle`,
      "POST",
      payload,
    ),
  updateLifecycle: (
    organizationId: string,
    itemId: string,
    payload: Partial<{
      title: string;
      description: string;
      amount: string;
      due_at: string;
      owner_user_id: string | null;
      reminder_days: number;
      recurrence: Recurrence;
      status: "active" | "completed" | "cancelled";
    }>,
  ) =>
    jsonRequest<LifecycleItem>(
      `/organizations/${organizationId}/lifecycle/${itemId}`,
      "PATCH",
      payload,
    ),
  downloadCalendarExport: (organizationId: string) =>
    download(
      `${API_PREFIX}/organizations/${organizationId}/calendar.ics`,
      "lenslayer-calendar.ics",
    ),
};
