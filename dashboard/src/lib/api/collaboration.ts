import type {
  ApprovalRequest,
  ApprovalStatus,
  ContractActivity,
  ContractComment,
  ContractDecision,
  ContractDecisionName,
  ExternalShare,
  ExternalShareCreated,
  SharedContract,
} from "../types";
import { request, jsonRequest, download, API_PREFIX } from "./client";

export const collaborationApi = {
  comments: (organizationId: string, contractId: string) =>
    request<ContractComment[]>(
      `/organizations/${organizationId}/contracts/${contractId}/comments`,
    ),
  createComment: (
    organizationId: string,
    contractId: string,
    payload: {
      body: string;
      mentioned_user_ids: string[];
    },
  ) =>
    jsonRequest<ContractComment>(
      `/organizations/${organizationId}/contracts/${contractId}/comments`,
      "POST",
      payload,
    ),
  decisions: (organizationId: string, contractId: string) =>
    request<ContractDecision[]>(
      `/organizations/${organizationId}/contracts/${contractId}/decisions`,
    ),
  createDecision: (
    organizationId: string,
    contractId: string,
    payload: {
      decision: ContractDecisionName;
      subject: string;
      rationale: string;
      source_reference?: Record<string, unknown>;
    },
  ) =>
    jsonRequest<ContractDecision>(
      `/organizations/${organizationId}/contracts/${contractId}/decisions`,
      "POST",
      payload,
    ),
  approvals: (organizationId: string, contractId: string) =>
    request<ApprovalRequest[]>(
      `/organizations/${organizationId}/contracts/${contractId}/approvals`,
    ),
  createApproval: (
    organizationId: string,
    contractId: string,
    payload: {
      title: string;
      note?: string;
      assigned_to_user_id?: string | null;
      conditions?: string[];
      due_at?: string | null;
    },
  ) =>
    jsonRequest<ApprovalRequest>(
      `/organizations/${organizationId}/contracts/${contractId}/approvals`,
      "POST",
      payload,
    ),
  decideApproval: (
    organizationId: string,
    contractId: string,
    approvalId: string,
    payload: {
      status: Exclude<ApprovalStatus, "pending">;
      resolution_note: string;
      condition_results: Record<string, boolean>;
    },
  ) =>
    jsonRequest<ApprovalRequest>(
      `/organizations/${organizationId}/contracts/${contractId}/approvals/${approvalId}/decision`,
      "POST",
      payload,
    ),
  shares: (organizationId: string, contractId: string) =>
    request<ExternalShare[]>(
      `/organizations/${organizationId}/contracts/${contractId}/shares`,
    ),
  createShare: (
    organizationId: string,
    contractId: string,
    payload: {
      label: string;
      include_evidence: boolean;
      expires_in_days: 1 | 3 | 7 | 14 | 30;
    },
  ) =>
    jsonRequest<ExternalShareCreated>(
      `/organizations/${organizationId}/contracts/${contractId}/shares`,
      "POST",
      payload,
    ),
  revokeShare: (organizationId: string, contractId: string, shareId: string) =>
    request<void>(
      `/organizations/${organizationId}/contracts/${contractId}/shares/${shareId}`,
      { method: "DELETE" },
    ),
  sharedContract: (token: string) =>
    request<SharedContract>(`/shared/${encodeURIComponent(token)}`),
  contractActivity: (organizationId: string, contractId: string) =>
    request<ContractActivity[]>(
      `/organizations/${organizationId}/contracts/${contractId}/activity`,
    ),
  downloadCounselHandoff: (organizationId: string, contractId: string) =>
    download(
      `${API_PREFIX}/organizations/${organizationId}/contracts/${contractId}/counsel-handoff`,
      `${contractId}-counsel-handoff.docx`,
    ),
};
