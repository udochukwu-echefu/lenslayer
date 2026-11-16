import type {
  ApiKey, ApiKeyCreated, ApprovalRequest, ApprovalStatus, AuditEvent, Contract, ContractActivity, ContractComment,
  ContractCreated, ContractDecision, ContractDecisionName, ContractQuestionAnswer, ContractVersion, CounterpartyResponse,
  DealPassport, ExternalShare, ExternalShareCreated, IntakeAddress, IntegrationConnection, IntegrationImport,
  IntegrationProviderDescriptor, Invitation, InvitationAccepted, InvitationCreated, InvitationPreview, Job, LifecycleItem,
  LifecycleKind, Membership, NegotiationItem, NegotiationItemCategory, NegotiationItemStatus, NegotiationSummary,
  Notification, Organization, OrganizationSettings, PortfolioAnswer, Recurrence, ReportOverview, ReportRange, Review,
  Role, TaskCreate, TaskUpdate, User, WebhookCreated, WebhookDelivery, WebhookSubscription, WorkflowTask,
} from "../shared/types";
import { downloadAndShare } from "../files";
import { jsonRequest, queryString, request } from "./client";
import type {
  CalendarGrid, CalendarWindow, ContractFilters, LifecycleFilters, OverviewWindow, QueryPage, TaskFilters, WorkspaceOverview, WorkspaceSearch,
} from "./query-types";

export { ApiError } from "./client";

const org = (id: string) => `/organizations/${encodeURIComponent(id)}`;
const contract = (id: string, contractId: string) => `${org(id)}/contracts/${encodeURIComponent(contractId)}`;
type Signal = { signal?: AbortSignal };
type NegotiationPriority = "low" | "normal" | "high";

const query = <T,>(id: string, resource: string, filters: object, options?: Signal) =>
  request<T>(`${org(id)}/query/${resource}?${queryString(filters)}`, { signal: options?.signal });

/** Same surface as the dashboard's `api` facade, minus the synthetic demo adapter. */
export const api = {
  // Identity and workspaces
  me: () => request<User>("/me"),
  accountDeletionPreview: () => request<{ blocking_workspaces: string[] }>("/me/deletion"),
  deleteAccount: (confirmation: string) =>
    jsonRequest<{ deleted_workspaces: number; left_workspaces: number; identity_removed: boolean }>("/me/deletion", "POST", { confirmation }),
  organizations: () => request<Organization[]>("/organizations"),
  createOrganization: (payload: { name: string; slug: string }) => jsonRequest<Organization>("/organizations", "POST", payload),
  organizationSettings: (id: string) => request<OrganizationSettings>(`${org(id)}/settings`),
  updateOrganizationSettings: (id: string, payload: Partial<Pick<OrganizationSettings, "name" | "default_retention_days" | "default_retain_document" | "default_retain_source_text" | "notification_review_ready" | "notification_review_failed">>) =>
    jsonRequest<OrganizationSettings>(`${org(id)}/settings`, "PATCH", payload),
  members: (id: string, options?: Signal) => request<Membership[]>(`${org(id)}/members`, { signal: options?.signal }),
  updateMemberRole: (id: string, membershipId: string, role: Role) => jsonRequest<Membership>(`${org(id)}/members/${membershipId}`, "PATCH", { role }),
  removeMember: (id: string, membershipId: string) => request<void>(`${org(id)}/members/${membershipId}`, { method: "DELETE" }),
  invitations: (id: string) => request<Invitation[]>(`${org(id)}/invitations`),
  createInvitation: (id: string, payload: { email: string; role: Exclude<Role, "owner"> }) => jsonRequest<InvitationCreated>(`${org(id)}/invitations`, "POST", payload),
  revokeInvitation: (id: string, invitationId: string) => request<void>(`${org(id)}/invitations/${invitationId}`, { method: "DELETE" }),
  invitation: (token: string) => request<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`),
  acceptInvitation: (token: string) => request<InvitationAccepted>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),

  // Bounded workspace queries
  queryOverview: (id: string, window: OverviewWindow, options?: Signal) => query<WorkspaceOverview>(id, "overview", window, options),
  queryTaskCounts: (id: string, day_start: string, options?: Signal) => query<{ active_tasks: number; completed_tasks: number; overdue_tasks: number }>(id, "tasks/counts", { day_start }, options),
  queryCalendar: (id: string, window: CalendarWindow, options?: Signal) => query<CalendarGrid>(id, "calendar", window, options),
  queryContracts: (id: string, filters: ContractFilters = {}, options?: Signal) => query<QueryPage<Contract>>(id, "contracts", { limit: 25, offset: 0, ...filters }, options),
  queryTasks: (id: string, filters: TaskFilters = {}, options?: Signal) => query<QueryPage<WorkflowTask>>(id, "tasks", { limit: 25, offset: 0, ...filters }, options),
  queryLifecycle: (id: string, filters: LifecycleFilters = {}, options?: Signal) => query<QueryPage<LifecycleItem>>(id, "lifecycle", { limit: 25, offset: 0, ...filters }, options),
  searchWorkspace: (id: string, q: string, options?: Signal) => query<WorkspaceSearch>(id, "search", { q, limit: 7 }, options),

  // Contracts and review
  contract: (id: string, contractId: string) => request<Contract>(contract(id, contractId)),
  createContract: (id: string, body: FormData) => request<ContractCreated>(`${org(id)}/contracts`, { method: "POST", body }),
  deleteContract: (id: string, contractId: string) => request<void>(contract(id, contractId), { method: "DELETE" }),
  jobs: (id: string, contractId: string) => request<Job[]>(`${contract(id, contractId)}/jobs`),
  review: (id: string, contractId: string) => request<Review>(`${contract(id, contractId)}/review`),
  dealPassport: (id: string, contractId: string) => request<DealPassport>(`${contract(id, contractId)}/deal-passport`),
  askContract: (id: string, contractId: string, question: string) => jsonRequest<ContractQuestionAnswer>(`${contract(id, contractId)}/questions`, "POST", { question }),
  downloadRedline: (id: string, contractId: string) => downloadAndShare(`${contract(id, contractId)}/redline.docx`, `${contractId}-redline.docx`),
  downloadContractExport: (id: string, contractId: string, format: "pdf" | "docx" | "csv" | "md" | "json") =>
    downloadAndShare(`${contract(id, contractId)}/exports/${format}`, `${contractId}-review.${format}`),

  // Tasks
  createTask: (id: string, payload: TaskCreate) => jsonRequest<WorkflowTask>(`${org(id)}/tasks`, "POST", payload),
  updateTask: (id: string, taskId: string, payload: TaskUpdate) => jsonRequest<WorkflowTask>(`${org(id)}/tasks/${taskId}`, "PATCH", payload),
  deleteTask: (id: string, taskId: string) => request<void>(`${org(id)}/tasks/${taskId}`, { method: "DELETE" }),

  // Negotiation
  versions: (id: string, contractId: string) => request<ContractVersion[]>(`${contract(id, contractId)}/versions`),
  uploadVersion: (id: string, contractId: string, body: FormData) => request<ContractVersion>(`${contract(id, contractId)}/versions`, { method: "POST", body }),
  negotiationItems: (id: string, contractId: string) => request<NegotiationItem[]>(`${contract(id, contractId)}/negotiation-items`),
  createNegotiationItem: (id: string, contractId: string, payload: { title: string; description?: string; category?: NegotiationItemCategory; priority?: NegotiationPriority; status?: NegotiationItemStatus; our_position?: string; counterparty_position?: string; source_reference?: Record<string, unknown> }) =>
    jsonRequest<NegotiationItem>(`${contract(id, contractId)}/negotiation-items`, "POST", payload),
  updateNegotiationItem: (id: string, contractId: string, itemId: string, payload: Partial<{ title: string; description: string; category: NegotiationItemCategory; priority: NegotiationPriority; status: NegotiationItemStatus; our_position: string; counterparty_position: string }>) =>
    jsonRequest<NegotiationItem>(`${contract(id, contractId)}/negotiation-items/${itemId}`, "PATCH", payload),
  counterpartyResponses: (id: string, contractId: string) => request<CounterpartyResponse[]>(`${contract(id, contractId)}/counterparty-responses`),
  createCounterpartyResponse: (id: string, contractId: string, payload: { responder_name?: string; channel?: string; body: string; contract_version_id?: string | null; related_item_ids?: string[] }) =>
    jsonRequest<CounterpartyResponse>(`${contract(id, contractId)}/counterparty-responses`, "POST", payload),
  negotiationSummary: (id: string, contractId: string) => request<NegotiationSummary>(`${contract(id, contractId)}/negotiation-summary`),

  // Collaboration
  comments: (id: string, contractId: string) => request<ContractComment[]>(`${contract(id, contractId)}/comments`),
  createComment: (id: string, contractId: string, payload: { body: string; mentioned_user_ids: string[] }) => jsonRequest<ContractComment>(`${contract(id, contractId)}/comments`, "POST", payload),
  decisions: (id: string, contractId: string) => request<ContractDecision[]>(`${contract(id, contractId)}/decisions`),
  createDecision: (id: string, contractId: string, payload: { decision: ContractDecisionName; subject: string; rationale: string; source_reference?: Record<string, unknown> }) =>
    jsonRequest<ContractDecision>(`${contract(id, contractId)}/decisions`, "POST", payload),
  approvals: (id: string, contractId: string) => request<ApprovalRequest[]>(`${contract(id, contractId)}/approvals`),
  createApproval: (id: string, contractId: string, payload: { title: string; note?: string; assigned_to_user_id?: string | null; conditions?: string[]; due_at?: string | null }) =>
    jsonRequest<ApprovalRequest>(`${contract(id, contractId)}/approvals`, "POST", payload),
  decideApproval: (id: string, contractId: string, approvalId: string, payload: { status: Exclude<ApprovalStatus, "pending">; resolution_note: string; condition_results: Record<string, boolean> }) =>
    jsonRequest<ApprovalRequest>(`${contract(id, contractId)}/approvals/${approvalId}/decision`, "POST", payload),
  shares: (id: string, contractId: string) => request<ExternalShare[]>(`${contract(id, contractId)}/shares`),
  createShare: (id: string, contractId: string, payload: { label: string; include_evidence: boolean; expires_in_days: 1 | 3 | 7 | 14 | 30 }) =>
    jsonRequest<ExternalShareCreated>(`${contract(id, contractId)}/shares`, "POST", payload),
  revokeShare: (id: string, contractId: string, shareId: string) => request<void>(`${contract(id, contractId)}/shares/${shareId}`, { method: "DELETE" }),
  contractActivity: (id: string, contractId: string) => request<ContractActivity[]>(`${contract(id, contractId)}/activity`),
  downloadCounselHandoff: (id: string, contractId: string) => downloadAndShare(`${contract(id, contractId)}/counsel-handoff`, `${contractId}-counsel-handoff.docx`),

  // Lifecycle
  createLifecycle: (id: string, contractId: string, payload: { kind: LifecycleKind; title: string; description?: string; amount?: string; due_at: string; owner_user_id?: string | null; reminder_days?: number; recurrence?: Recurrence }) =>
    jsonRequest<LifecycleItem>(`${contract(id, contractId)}/lifecycle`, "POST", payload),
  updateLifecycle: (id: string, itemId: string, payload: Partial<{ title: string; description: string; amount: string; due_at: string; owner_user_id: string | null; reminder_days: number; recurrence: Recurrence; status: "active" | "completed" | "cancelled" }>) =>
    jsonRequest<LifecycleItem>(`${org(id)}/lifecycle/${itemId}`, "PATCH", payload),
  downloadCalendarExport: (id: string) => downloadAndShare(`${org(id)}/calendar.ics`, "lenslayer-calendar.ics"),

  // Governance
  askPortfolio: (id: string, question: string) => jsonRequest<PortfolioAnswer>(`${org(id)}/portfolio/questions`, "POST", { question }),
  notifications: (id: string) => request<Notification[]>(`${org(id)}/notifications`),
  markNotificationRead: (id: string, notificationId: string) => request<Notification>(`${org(id)}/notifications/${notificationId}/read`, { method: "PATCH" }),
  markAllNotificationsRead: (id: string) => request<void>(`${org(id)}/notifications/read-all`, { method: "POST" }),
  auditEvents: (id: string) => request<AuditEvent[]>(`${org(id)}/audit-events`),
  reportOverview: (id: string, range: ReportRange) => request<ReportOverview>(`${org(id)}/reports/overview?range=${range}`),
  downloadReportExport: (id: string, range: ReportRange) => downloadAndShare(`${org(id)}/reports/export?range=${range}`, `lenslayer-report-${range}.csv`),

  // Integrations and developer access
  integrations: (id: string) => request<IntegrationConnection[]>(`${org(id)}/integrations`),
  integrationProviders: (id: string) => request<IntegrationProviderDescriptor[]>(`${org(id)}/integrations/providers`),
  intakeEmailAddress: (id: string) => request<IntakeAddress>(`${org(id)}/intake/email-address`),
  revokeIntegration: (id: string, connectionId: string) => request<void>(`${org(id)}/integrations/${connectionId}`, { method: "DELETE" }),
  integrationImports: (id: string) => request<IntegrationImport[]>(`${org(id)}/integrations/imports`),
  apiKeys: (id: string) => request<ApiKey[]>(`${org(id)}/api-keys`),
  createApiKey: (id: string, payload: { name: string; scopes: string[] }) => jsonRequest<ApiKeyCreated>(`${org(id)}/api-keys`, "POST", payload),
  revokeApiKey: (id: string, apiKeyId: string) => request<void>(`${org(id)}/api-keys/${apiKeyId}`, { method: "DELETE" }),
  webhooks: (id: string) => request<WebhookSubscription[]>(`${org(id)}/webhooks`),
  createWebhook: (id: string, payload: { target_url: string; description?: string; events: ("contract.created" | "contract.review_ready" | "contract.review_failed")[] }) =>
    jsonRequest<WebhookCreated>(`${org(id)}/webhooks`, "POST", payload),
  revokeWebhook: (id: string, webhookId: string) => request<void>(`${org(id)}/webhooks/${webhookId}`, { method: "DELETE" }),
  webhookDeliveries: (id: string) => request<WebhookDelivery[]>(`${org(id)}/webhook-deliveries`),
};

export type Api = typeof api;
