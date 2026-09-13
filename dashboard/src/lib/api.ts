import type { ApiKey, ApiKeyCreated, ApprovalRequest, ApprovalStatus, AuditEvent, Contract, ContractActivity, ContractComment, ContractCreated, ContractDecision, ContractDecisionName, ContractQuestionAnswer, ContractVersion, CounterpartyResponse, DealPassport, ExternalShare, ExternalShareCreated, IntakeAddress, IntegrationConnection, IntegrationImport, IntegrationProvider, IntegrationProviderDescriptor, Invitation, InvitationAccepted, InvitationCreated, InvitationPreview, Job, LifecycleItem, LifecycleKind, Membership, NegotiationItem, NegotiationItemCategory, NegotiationItemStatus, NegotiationSummary, Notification, Organization, OrganizationSettings, PortfolioAnswer, Recurrence, ReportOverview, ReportRange, Review, Role, SharedContract, TaskCreate, TaskStatus, TaskUpdate, User, WebhookCreated, WebhookDelivery, WebhookSubscription, WorkflowTask } from "./types";
import { DEMO_WORKSPACE_ID, getDemoResponse } from "./demo-data";
import { getSession } from "next-auth/react";

export function resolvePlatformApiPrefix(platformApiUrl?: string) {
  const origin = platformApiUrl?.replace(/\/$/, "");
  return origin ? `${origin}/api/v1` : "/api/platform/api/v1";
}

const API_PREFIX = resolvePlatformApiPrefix(process.env.NEXT_PUBLIC_PLATFORM_API_URL);
const PUBLIC_ACCESS_ENABLED = process.env.NEXT_PUBLIC_LENSLAYER_PUBLIC_ACCESS === "true";
let sessionRequest: ReturnType<typeof getSession> | null = null;
let cachedSession: Awaited<ReturnType<typeof getSession>> = null;
let sessionCachedAt = 0;
const SESSION_CACHE_MS = 30_000;

function authenticatedSession() {
  if (cachedSession?.accessToken && Date.now() - sessionCachedAt < SESSION_CACHE_MS) {
    return Promise.resolve(cachedSession);
  }
  if (!sessionRequest) {
    sessionRequest = getSession()
      .then((session) => {
        if (session?.accessToken) {
          cachedSession = session;
          sessionCachedAt = Date.now();
        }
        return session;
      })
      .finally(() => { sessionRequest = null; });
  }
  return sessionRequest;
}

const waitForSessionHydration = () => new Promise<void>((resolve) => setTimeout(resolve, 250));

export async function resolveAuthenticatedSession(
  getCurrentSession = authenticatedSession,
  pause = waitForSessionHydration,
) {
  const session = await getCurrentSession();
  if (session?.accessToken) return session;

  // NextAuth can report an authenticated UI one tick before the access token is
  // readable through getSession(). Give mutating requests one short grace retry.
  await pause();
  return getCurrentSession();
}

export function isPublicAccessEnabled() {
  return PUBLIC_ACCESS_ENABLED;
}

export function isDemoWorkspace(organizationId?: string | null) {
  return organizationId === DEMO_WORKSPACE_ID;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public detail?: unknown) { super(message); }
}

async function request<T>(path: string, init?: RequestInit, usePublicAccess = PUBLIC_ACCESS_ENABLED): Promise<T> {
  if (usePublicAccess) {
    const preview = getDemoResponse(path, init);
    if (preview.handled && "error" in preview) throw new ApiError(preview.error, preview.status);
    if (preview.handled) return preview.value as T;
  }
  const headers = new Headers(init?.headers);
  const method = init?.method?.toUpperCase() ?? "GET";
  const session = method === "GET"
    ? await authenticatedSession()
    : await resolveAuthenticatedSession();
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  const response = await fetch(`${API_PREFIX}${path}`, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    let detail: unknown;
    try { detail = await response.json(); } catch { detail = await response.text(); }
    const message = typeof detail === "object" && detail && "detail" in detail ? String((detail as { detail: unknown }).detail) : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function download(path: string, filename: string) {
  const session = await resolveAuthenticatedSession();
  if (!session?.accessToken) throw new ApiError("Sign in to download this file.", 401);
  const response = await fetch(path, { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new ApiError(`Download failed (${response.status})`, response.status);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  me: (usePublicAccess = PUBLIC_ACCESS_ENABLED) => request<User>("/me", undefined, usePublicAccess),
  organizations: (usePublicAccess = PUBLIC_ACCESS_ENABLED) => request<Organization[]>("/organizations", undefined, usePublicAccess),
  createOrganization: (payload: { name: string; slug: string }) => request<Organization>("/organizations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, false),
  organizationSettings: (organizationId: string) => request<OrganizationSettings>(`/organizations/${organizationId}/settings`),
  updateOrganizationSettings: (organizationId: string, payload: Partial<Pick<OrganizationSettings, "name" | "default_retention_days" | "default_retain_document" | "default_retain_source_text" | "notification_review_ready" | "notification_review_failed">>) => request<OrganizationSettings>(`/organizations/${organizationId}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  members: (organizationId: string) => request<Membership[]>(`/organizations/${organizationId}/members`),
  updateMemberRole: (organizationId: string, membershipId: string, role: Role) => request<Membership>(`/organizations/${organizationId}/members/${membershipId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) }),
  removeMember: (organizationId: string, membershipId: string) => request<void>(`/organizations/${organizationId}/members/${membershipId}`, { method: "DELETE" }),
  invitations: (organizationId: string) => request<Invitation[]>(`/organizations/${organizationId}/invitations`),
  createInvitation: (organizationId: string, payload: { email: string; role: Exclude<Role, "owner"> }) => request<InvitationCreated>(`/organizations/${organizationId}/invitations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  revokeInvitation: (organizationId: string, invitationId: string) => request<void>(`/organizations/${organizationId}/invitations/${invitationId}`, { method: "DELETE" }),
  invitation: (token: string) => request<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string) => request<InvitationAccepted>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
  tasks: (organizationId: string, filters?: { taskStatus?: TaskStatus; assignedToUserId?: string; contractId?: string; dueBefore?: string; dueAfter?: string }) => {
    const params = new URLSearchParams();
    if (filters?.taskStatus) params.set("task_status", filters.taskStatus);
    if (filters?.assignedToUserId) params.set("assigned_to_user_id", filters.assignedToUserId);
    if (filters?.contractId) params.set("contract_id", filters.contractId);
    if (filters?.dueBefore) params.set("due_before", filters.dueBefore);
    if (filters?.dueAfter) params.set("due_after", filters.dueAfter);
    const query = params.size ? `?${params.toString()}` : "";
    return request<WorkflowTask[]>(`/organizations/${organizationId}/tasks${query}`);
  },
  createTask: (organizationId: string, payload: TaskCreate) => request<WorkflowTask>(`/organizations/${organizationId}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  updateTask: (organizationId: string, taskId: string, payload: TaskUpdate) => request<WorkflowTask>(`/organizations/${organizationId}/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  deleteTask: (organizationId: string, taskId: string) => request<void>(`/organizations/${organizationId}/tasks/${taskId}`, { method: "DELETE" }),
  contracts: (organizationId: string) => request<Contract[]>(`/organizations/${organizationId}/contracts`),
  contract: (organizationId: string, contractId: string) => request<Contract>(`/organizations/${organizationId}/contracts/${contractId}`),
  createContract: (organizationId: string, body: FormData) => request<ContractCreated>(`/organizations/${organizationId}/contracts`, { method: "POST", body }),
  deleteContract: (organizationId: string, contractId: string) => request<void>(`/organizations/${organizationId}/contracts/${contractId}`, { method: "DELETE" }),
  jobs: (organizationId: string, contractId: string) => request<Job[]>(`/organizations/${organizationId}/contracts/${contractId}/jobs`),
  review: (organizationId: string, contractId: string) => request<Review>(`/organizations/${organizationId}/contracts/${contractId}/review`),
  integrations: (organizationId: string, provider?: IntegrationProvider) => request<IntegrationConnection[]>(`/organizations/${organizationId}/integrations${provider ? `?provider=${provider}` : ""}`),
  integrationProviders: (organizationId: string) => request<IntegrationProviderDescriptor[]>(`/organizations/${organizationId}/integrations/providers`),
  intakeEmailAddress: (organizationId: string) => request<IntakeAddress>(`/organizations/${organizationId}/intake/email-address`),
  createIntegration: (organizationId: string, payload: { provider: IntegrationProvider; display_name: string; external_account_id?: string; capabilities?: string[]; settings?: Record<string, unknown> }) => request<IntegrationConnection>(`/organizations/${organizationId}/integrations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  revokeIntegration: (organizationId: string, connectionId: string) => request<void>(`/organizations/${organizationId}/integrations/${connectionId}`, { method: "DELETE" }),
  integrationImports: (organizationId: string, provider?: IntegrationProvider) => request<IntegrationImport[]>(`/organizations/${organizationId}/integrations/imports${provider ? `?provider=${provider}` : ""}`),
  importProviderFile: (organizationId: string, provider: IntegrationProvider, body: FormData) => request<{ import_record: IntegrationImport; contract: Contract; asset: ContractCreated["asset"]; job: Job }>(`/organizations/${organizationId}/integrations/${provider}/imports`, { method: "POST", body }),
  apiKeys: (organizationId: string) => request<ApiKey[]>(`/organizations/${organizationId}/api-keys`),
  createApiKey: (organizationId: string, payload: { name: string; scopes: string[] }) => request<ApiKeyCreated>(`/organizations/${organizationId}/api-keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  revokeApiKey: (organizationId: string, apiKeyId: string) => request<void>(`/organizations/${organizationId}/api-keys/${apiKeyId}`, { method: "DELETE" }),
  webhooks: (organizationId: string) => request<WebhookSubscription[]>(`/organizations/${organizationId}/webhooks`),
  createWebhook: (organizationId: string, payload: { target_url: string; description?: string; events: Array<"contract.created" | "contract.review_ready" | "contract.review_failed"> }) => request<WebhookCreated>(`/organizations/${organizationId}/webhooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  revokeWebhook: (organizationId: string, webhookId: string) => request<void>(`/organizations/${organizationId}/webhooks/${webhookId}`, { method: "DELETE" }),
  webhookDeliveries: (organizationId: string) => request<WebhookDelivery[]>(`/organizations/${organizationId}/webhook-deliveries`),
  versions: (organizationId: string, contractId: string) => request<ContractVersion[]>(`/organizations/${organizationId}/contracts/${contractId}/versions`),
  uploadVersion: (organizationId: string, contractId: string, body: FormData) => request<ContractVersion>(`/organizations/${organizationId}/contracts/${contractId}/versions`, { method: "POST", body }),
  negotiationItems: (organizationId: string, contractId: string) => request<NegotiationItem[]>(`/organizations/${organizationId}/contracts/${contractId}/negotiation-items`),
  createNegotiationItem: (organizationId: string, contractId: string, payload: { title: string; description?: string; category?: NegotiationItemCategory; priority?: "low" | "normal" | "high"; status?: NegotiationItemStatus; our_position?: string; counterparty_position?: string; source_reference?: Record<string, unknown> }) => request<NegotiationItem>(`/organizations/${organizationId}/contracts/${contractId}/negotiation-items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  updateNegotiationItem: (organizationId: string, contractId: string, itemId: string, payload: Partial<{ title: string; description: string; category: NegotiationItemCategory; priority: "low" | "normal" | "high"; status: NegotiationItemStatus; our_position: string; counterparty_position: string; source_reference: Record<string, unknown> }>) => request<NegotiationItem>(`/organizations/${organizationId}/contracts/${contractId}/negotiation-items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  counterpartyResponses: (organizationId: string, contractId: string) => request<CounterpartyResponse[]>(`/organizations/${organizationId}/contracts/${contractId}/counterparty-responses`),
  createCounterpartyResponse: (organizationId: string, contractId: string, payload: { responder_name?: string; channel?: string; body: string; contract_version_id?: string | null; related_item_ids?: string[] }) => request<CounterpartyResponse>(`/organizations/${organizationId}/contracts/${contractId}/counterparty-responses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  negotiationSummary: (organizationId: string, contractId: string) => request<NegotiationSummary>(`/organizations/${organizationId}/contracts/${contractId}/negotiation-summary`),
  dealPassport: (organizationId: string, contractId: string) => request<DealPassport>(`/organizations/${organizationId}/contracts/${contractId}/deal-passport`),
  downloadRedline: (organizationId: string, contractId: string) => download(`${API_PREFIX}/organizations/${organizationId}/contracts/${contractId}/redline.docx`, `${contractId}-redline.docx`),
  comments: (organizationId: string, contractId: string) => request<ContractComment[]>(`/organizations/${organizationId}/contracts/${contractId}/comments`),
  createComment: (organizationId: string, contractId: string, payload: { body: string; mentioned_user_ids: string[] }) => request<ContractComment>(`/organizations/${organizationId}/contracts/${contractId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  decisions: (organizationId: string, contractId: string) => request<ContractDecision[]>(`/organizations/${organizationId}/contracts/${contractId}/decisions`),
  createDecision: (organizationId: string, contractId: string, payload: { decision: ContractDecisionName; subject: string; rationale: string; source_reference?: Record<string, unknown> }) => request<ContractDecision>(`/organizations/${organizationId}/contracts/${contractId}/decisions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  approvals: (organizationId: string, contractId: string) => request<ApprovalRequest[]>(`/organizations/${organizationId}/contracts/${contractId}/approvals`),
  createApproval: (organizationId: string, contractId: string, payload: { title: string; note?: string; assigned_to_user_id?: string | null; conditions?: string[]; due_at?: string | null }) => request<ApprovalRequest>(`/organizations/${organizationId}/contracts/${contractId}/approvals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  decideApproval: (organizationId: string, contractId: string, approvalId: string, payload: { status: Exclude<ApprovalStatus, "pending">; resolution_note: string; condition_results: Record<string, boolean> }) => request<ApprovalRequest>(`/organizations/${organizationId}/contracts/${contractId}/approvals/${approvalId}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  shares: (organizationId: string, contractId: string) => request<ExternalShare[]>(`/organizations/${organizationId}/contracts/${contractId}/shares`),
  createShare: (organizationId: string, contractId: string, payload: { label: string; include_evidence: boolean; expires_in_days: 1 | 3 | 7 | 14 | 30 }) => request<ExternalShareCreated>(`/organizations/${organizationId}/contracts/${contractId}/shares`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  revokeShare: (organizationId: string, contractId: string, shareId: string) => request<void>(`/organizations/${organizationId}/contracts/${contractId}/shares/${shareId}`, { method: "DELETE" }),
  sharedContract: (token: string) => request<SharedContract>(`/shared/${encodeURIComponent(token)}`),
  contractActivity: (organizationId: string, contractId: string) => request<ContractActivity[]>(`/organizations/${organizationId}/contracts/${contractId}/activity`),
  downloadCounselHandoff: (organizationId: string, contractId: string) => download(`${API_PREFIX}/organizations/${organizationId}/contracts/${contractId}/counsel-handoff`, `${contractId}-counsel-handoff.docx`),
  lifecycle: (organizationId: string, filters?: { contractId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.contractId) params.set("contract_id", filters.contractId);
    if (filters?.status) params.set("lifecycle_status", filters.status);
    return request<LifecycleItem[]>(`/organizations/${organizationId}/lifecycle${params.size ? `?${params}` : ""}`);
  },
  createLifecycle: (organizationId: string, contractId: string, payload: { kind: LifecycleKind; title: string; description?: string; amount?: string; due_at: string; owner_user_id?: string | null; reminder_days?: number; recurrence?: Recurrence }) => request<LifecycleItem>(`/organizations/${organizationId}/contracts/${contractId}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  updateLifecycle: (organizationId: string, itemId: string, payload: Partial<{ title: string; description: string; amount: string; due_at: string; owner_user_id: string | null; reminder_days: number; recurrence: Recurrence; status: "active" | "completed" | "cancelled" }>) => request<LifecycleItem>(`/organizations/${organizationId}/lifecycle/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  downloadCalendarExport: (organizationId: string) => download(`${API_PREFIX}/organizations/${organizationId}/calendar.ics`, "lenslayer-calendar.ics"),
  askPortfolio: (organizationId: string, question: string) => request<PortfolioAnswer>(`/organizations/${organizationId}/portfolio/questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }),
  askContract: (organizationId: string, contractId: string, question: string) => request<ContractQuestionAnswer>(`/organizations/${organizationId}/contracts/${contractId}/questions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }),
  downloadContractExport: (organizationId: string, contractId: string, format: "pdf" | "docx" | "csv" | "md" | "json") => download(`${API_PREFIX}/organizations/${organizationId}/contracts/${contractId}/exports/${format}`, `${contractId}-review.${format}`),
  notifications: (organizationId: string) => request<Notification[]>(`/organizations/${organizationId}/notifications`),
  markNotificationRead: (organizationId: string, notificationId: string) => request<Notification>(`/organizations/${organizationId}/notifications/${notificationId}/read`, { method: "PATCH" }),
  markAllNotificationsRead: (organizationId: string) => request<void>(`/organizations/${organizationId}/notifications/read-all`, { method: "POST" }),
  auditEvents: (organizationId: string) => request<AuditEvent[]>(`/organizations/${organizationId}/audit-events`),
  reportOverview: (organizationId: string, range: ReportRange) => request<ReportOverview>(`/organizations/${organizationId}/reports/overview?range=${range}`),
  downloadReportExport: (organizationId: string, range: ReportRange) => download(`${API_PREFIX}/organizations/${organizationId}/reports/export?range=${range}`, `lenslayer-report-${range}.csv`),
};
