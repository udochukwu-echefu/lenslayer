export type User = { id: string; email: string; display_name: string };

export type Role = "owner" | "admin" | "reviewer" | "viewer";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  role: Role | null;
  created_at: string;
};

export type OrganizationSettings = {
  organization_id: string;
  name: string;
  slug: string;
  default_retention_days: 7 | 30 | 90 | 365;
  default_retain_document: boolean;
  default_retain_source_text: boolean;
  notification_review_ready: boolean;
  notification_review_failed: boolean;
  updated_at: string;
};

export type Job = {
  id: string;
  kind: string;
  status: string;
  progress_step: string;
  attempts: number;
  error_code: string;
  error_message: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type Contract = {
  id: string;
  organization_id: string;
  title: string;
  source_name: string;
  counterparty: string;
  contract_type: string;
  status: string;
  review_context: Record<string, unknown>;
  retain_document: boolean;
  retain_source_text: boolean;
  retention_days: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  latest_job: Job | null;
};

export type RiskFinding = {
  title?: string;
  risk_level?: string;
  clause?: string;
  explanation?: string;
  recommendation?: string;
  suggested_language?: string;
  confidence?: string | number;
  evidence?: string;
  excerpt?: string;
  quote?: string;
  citation?: string;
  location?: string;
  page?: string | number;
  section?: string;
};

export type ReviewAnalysis = {
  title?: string;
  contract_type?: string;
  executive_summary?: string;
  overall_attention?: string;
  governing_law?: string;
  parties_involved?: string[];
  risk_assessment?: RiskFinding[];
  obligations?: Array<Record<string, unknown>>;
  deadlines?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
  negotiation_priorities?: Array<Record<string, unknown> | string>;
  missing_protections?: Array<Record<string, unknown> | string>;
  uncertainties?: Array<Record<string, unknown> | string>;
  key_terms?: Array<Record<string, unknown>>;
  playbook_evaluation?: {
    playbook_name?: string;
    summary?: Record<string, number>;
    deviations?: Array<Record<string, unknown>>;
  };
  [key: string]: unknown;
};

export type Review = {
  id: string;
  analysis: ReviewAnalysis;
  quality: Record<string, unknown>;
  source_text_retained: boolean;
  created_at: string;
  updated_at: string;
};

export type ContractQuestionAnswer = {
  answer: string;
  sources: Array<{ label: string; location: string; excerpt: string }>;
  generated_by: "model" | "extractive";
};

export type ContractVersionComparison = {
  compared_to_version_id: string | null;
  added: string[];
  removed: string[];
  changed_summary: string;
  added_count: number;
  removed_count: number;
};

export type ContractVersion = {
  id: string;
  contract_id: string;
  document_asset_id: string | null;
  version_number: number;
  label: string;
  notes: string;
  source_name: string;
  sha256: string;
  size_bytes: number;
  comparison: ContractVersionComparison;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string;
  created_at: string;
};

export type Notification = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  kind: string;
  title: string;
  message: string;
  action_url: string;
  read_at: string | null;
  created_at: string;
};

export type IntegrationProvider = "email" | "google_drive" | "onedrive" | "sharepoint" | "dropbox" | "slack" | "telegram" | "whatsapp" | "public_api";
export type IntegrationProviderDescriptor = {
  provider: IntegrationProvider;
  display_name: string;
  category: "email" | "cloud_storage" | "messaging" | "developer";
  capabilities: string[];
  connection_mode: "managed" | "oauth" | "bot" | "webhook" | "api_key" | "secure_link";
  configured: boolean;
};
export type IntakeAddress = { address: string; enabled: boolean; instructions: string };
export type IntegrationConnection = {
  id: string;
  organization_id: string;
  provider: IntegrationProvider;
  display_name: string;
  external_account_id: string;
  status: "active" | "paused" | "revoked" | "error";
  capabilities: string[];
  settings: Record<string, unknown>;
  last_sync_at: string | null;
  error_message: string;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

export type IntegrationImport = {
  id: string;
  organization_id: string;
  connection_id: string | null;
  contract_id: string | null;
  provider: IntegrationProvider;
  source_type: string;
  external_id: string;
  source_url: string;
  title: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  status: string;
  metadata: Record<string, unknown>;
  error_message: string;
  imported_by_user_id: string | null;
  imported_by_name: string;
  created_at: string;
  updated_at: string;
};

export type ApiKey = {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
};

export type ApiKeyCreated = { api_key: ApiKey; token: string };

export type WebhookSubscription = {
  id: string;
  organization_id: string;
  target_url: string;
  description: string;
  events: Array<"contract.created" | "contract.review_ready" | "contract.review_failed">;
  secret_prefix: string;
  status: string;
  last_delivery_at: string | null;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

export type WebhookCreated = { subscription: WebhookSubscription; signing_secret: string };

export type WebhookDelivery = {
  id: string;
  subscription_id: string;
  contract_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  last_error: string;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractComment = {
  id: string;
  body: string;
  mentioned_user_ids: string[];
  author_user_id: string;
  author_name: string;
  author_email: string;
  created_at: string;
  updated_at: string;
};

export type ContractDecisionName = "accept" | "change" | "escalate" | "resolve";
export type ContractDecision = {
  id: string;
  decision: ContractDecisionName;
  subject: string;
  rationale: string;
  source_reference: Record<string, unknown>;
  reviewer_user_id: string;
  reviewer_name: string;
  reviewer_email: string;
  created_at: string;
};

export type NegotiationItemStatus = "proposed" | "accepted" | "rejected" | "unresolved" | "resolved";
export type NegotiationItemCategory = "change" | "commercial" | "legal" | "operational" | "open_point";
export type NegotiationItem = {
  id: string;
  contract_id: string;
  title: string;
  description: string;
  category: NegotiationItemCategory;
  priority: "low" | "normal" | "high";
  status: NegotiationItemStatus;
  our_position: string;
  counterparty_position: string;
  source_reference: Record<string, unknown>;
  created_by_user_id: string;
  created_by_name: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CounterpartyResponse = {
  id: string;
  contract_id: string;
  contract_version_id: string | null;
  recorded_by_user_id: string;
  recorded_by_name: string;
  responder_name: string;
  channel: string;
  body: string;
  related_item_ids: string[];
  created_at: string;
};

export type NegotiationSummary = {
  contract_id: string;
  latest_version: ContractVersion | null;
  version_count: number;
  checklist_count: number;
  accepted_changes: NegotiationItem[];
  rejected_changes: NegotiationItem[];
  unresolved_points: NegotiationItem[];
  counterparty_response_count: number;
  final_summary: string;
};

export type DealPassport = {
  contract_id: string;
  title: string;
  counterparty: string;
  contract_type: string;
  readiness: "ready" | "needs_attention" | "blocked";
  readiness_reasons: string[];
  executive_summary: string;
  overall_attention: string;
  top_risks: RiskFinding[];
  versions: ContractVersion[];
  negotiation: NegotiationSummary;
  approvals: Array<{ id: string; title: string; status: string; assigned_to: string; due_at: string | null }>;
  open_actions: Array<{ id: string; title: string; priority: string; status: string; owner: string; due_at: string | null }>;
  key_dates: Array<{ id: string; kind: string; title: string; due_at: string; owner: string }>;
  generated_at: string;
};

export type ApprovalStatus = "pending" | "approved" | "conditionally_approved" | "changes_requested" | "rejected" | "cancelled";
export type ApprovalRequest = {
  id: string;
  contract_id: string;
  title: string;
  note: string;
  status: ApprovalStatus;
  conditions: string[];
  condition_results: Record<string, boolean>;
  requested_by_user_id: string;
  requested_by_name: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  resolved_by_user_id: string | null;
  resolved_by_name: string | null;
  resolution_note: string;
  due_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalShare = {
  id: string;
  label: string;
  include_evidence: boolean;
  expires_at: string;
  revoked_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  created_at: string;
};

export type ExternalShareCreated = { share: ExternalShare; token: string };

export type SharedContract = {
  contract_title: string;
  counterparty: string;
  contract_type: string;
  executive_summary: string;
  overall_attention: string;
  risks: RiskFinding[];
  missing_protections: Array<Record<string, unknown> | string>;
  negotiation_priorities: Array<Record<string, unknown> | string>;
  expires_at: string;
  shared_for: string;
};

export type LifecycleKind = "renewal" | "notice" | "obligation" | "payment" | "post_signature";
export type Recurrence = "none" | "weekly" | "monthly" | "quarterly" | "yearly";
export type LifecycleItem = {
  id: string;
  organization_id: string;
  contract_id: string;
  contract_title: string;
  kind: LifecycleKind;
  title: string;
  description: string;
  amount: string;
  due_at: string;
  owner_user_id: string | null;
  owner_name: string | null;
  reminder_days: number;
  recurrence: Recurrence;
  status: "active" | "completed" | "cancelled";
  last_notified_at: string | null;
  escalated_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractActivity = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  actor_user_id: string | null;
  actor_name: string;
  created_at: string;
};

export type PortfolioAnswer = {
  answer: string;
  sources: Array<{ contract_id: string; contract_title: string; location: string; excerpt: string }>;
  generated_by: "model" | "extractive";
};

export type AuditEvent = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  actor_user_id: string | null;
  actor_name: string;
  actor_email: string;
  contract_id: string | null;
  verification_case_id: string | null;
  created_at: string;
};

export type ContractCreated = { contract: Contract; asset: { id: string; original_name: string; content_type: string; size_bytes: number; sha256: string; status: string; created_at: string }; job: Job };

export type Membership = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: Role;
  created_at: string;
};

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type Invitation = {
  id: string;
  email: string;
  role: Exclude<Role, "owner">;
  status: InvitationStatus;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type InvitationCreated = { invitation: Invitation; token: string };

export type InvitationPreview = {
  organization_name: string;
  organization_slug: string;
  email_hint: string;
  role: Exclude<Role, "owner">;
  status: InvitationStatus;
  expires_at: string;
};

export type InvitationAccepted = { organization: Organization; membership: Membership };

export type TaskStatus = "open" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high";
export type TaskCategory = "follow_up" | "risk" | "obligation" | "deadline" | "negotiation" | "professional_review";

export type WorkflowTask = {
  id: string;
  organization_id: string;
  contract_id: string | null;
  contract_title: string | null;
  created_by_user_id: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  source_kind: string;
  source_reference: Record<string, unknown>;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskCreate = {
  title: string;
  description?: string;
  contract_id?: string | null;
  assigned_to_user_id?: string | null;
  category?: TaskCategory;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_at?: string | null;
  source_kind?: string;
  source_reference?: Record<string, unknown>;
};

export type TaskUpdate = Partial<Omit<TaskCreate, "source_kind" | "source_reference">>;

export type VerificationAction = "Approve" | "Escalate" | "Reject";
export type VerificationStatus = "pending" | "in_review" | "needs_information" | "approved" | "escalated" | "rejected" | "closed";
export type VerificationPriority = "low" | "normal" | "high" | "urgent";
export type ReconciliationStatus = "matched" | "conflict" | "needs_review" | "resolved";

export type VerificationEvidence = {
  document: string;
  reference: string;
  field: string;
  value: string | number;
  confidence: number;
};

export type VerificationFinding = {
  code: string;
  title: string;
  severity: "High" | "Medium" | "Low";
  points: number;
  explanation: string;
  action: string;
  evidence: VerificationEvidence[];
};

export type VerificationDocument = {
  type: string;
  label: string;
  reference: string;
  confidence: number;
  fields: Record<string, string | number>;
};

export type VerificationDecision = {
  id: string;
  decision: VerificationAction;
  rationale: string;
  recommended_action: VerificationAction;
  reviewer_user_id: string;
  reviewer_name: string;
  reviewer_email: string;
  created_at: string;
};

export type VerificationUploadedDocument = {
  id: string;
  document_type: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  status: string;
  scan_status: "pending" | "clean" | "rejected";
  extraction_status: "pending" | "processing" | "ready" | "failed";
  extracted_fields: Record<string, string | number>;
  confidence: number;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VerificationAssignment = {
  id: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string;
  assigned_to_email: string;
  assigned_by_user_id: string;
  assigned_by_name: string;
  note: string;
  created_at: string;
};

export type VerificationReconciliation = {
  id: string;
  field_name: string;
  canonical_value: string;
  status: ReconciliationStatus;
  sources: Array<Record<string, unknown>>;
  resolution_note: string;
  resolved_by_user_id: string | null;
  resolved_by_name: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VerificationCaseSummary = {
  id: string;
  organization_id: string;
  reference: string;
  applicant_name: string;
  applicant_email: string;
  status: VerificationStatus;
  priority: VerificationPriority;
  assigned_to_user_id: string | null;
  assigned_to_name: string;
  assigned_to_email: string;
  intake_channel: string;
  risk_score: number;
  suggested_action: VerificationAction;
  finding_count: number;
  document_count: number;
  average_confidence: number;
  submitted_at: string;
  synthetic: boolean;
  due_at: string | null;
  expires_at: string | null;
  closed_at: string | null;
  latest_decision: VerificationDecision | null;
  created_at: string;
  updated_at: string;
};

export type VerificationCase = VerificationCaseSummary & {
  application: Record<string, string | number>;
  documents: VerificationDocument[];
  summary: string;
  reasoning: string;
  findings: VerificationFinding[];
  field_matrix: Array<Record<string, string | number>>;
  generated_at: string;
  decision_history: VerificationDecision[];
  uploaded_documents: VerificationUploadedDocument[];
  assignment_history: VerificationAssignment[];
  reconciliations: VerificationReconciliation[];
};

export type SecureIntakeLink = {
  id: string;
  organization_id: string;
  verification_case_id: string | null;
  token_prefix: string;
  channel: "secure_link" | "email" | "slack" | "telegram" | "whatsapp";
  recipient_name: string;
  recipient_email: string;
  recipient_phone_hint: string;
  applicant_name: string;
  message: string;
  max_uploads: number;
  upload_count: number;
  retention_days: number;
  status: "active" | "expired" | "revoked" | "complete";
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_by_user_id: string;
  created_by_name: string;
  created_at: string;
};

export type SecureIntakeLinkCreated = { intake_link: SecureIntakeLink; token: string };
export type SecureIntakePreview = {
  organization_name: string;
  applicant_name: string;
  message: string;
  remaining_uploads: number;
  status: "active" | "expired" | "revoked" | "complete";
  expires_at: string;
};

export type ReportRange = "30d" | "90d" | "365d" | "all";

export type ReportDistributionItem = {
  label: string;
  count: number;
};

export type ReportTimelinePoint = {
  label: string;
  period_start: string;
  period_end: string;
  contracts_created: number;
  tasks_created: number;
  tasks_completed: number;
  verification_submitted: number;
  decisions_recorded: number;
};

export type ReportWorkloadItem = {
  user_id: string;
  display_name: string;
  email: string;
  role: Role;
  active_tasks: number;
  overdue_tasks: number;
  completed_in_period: number;
};

export type ReportActivityItem = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  actor_user_id: string | null;
  actor_name: string;
  contract_id: string | null;
  contract_title: string | null;
  created_at: string;
};

export type ReportOverview = {
  organization_id: string;
  range: ReportRange;
  generated_at: string;
  period_start: string | null;
  period_end: string;
  contracts_total: number;
  contracts_ready: number;
  contracts_processing: number;
  contracts_failed: number;
  tasks_total: number;
  tasks_active: number;
  tasks_overdue: number;
  tasks_due_soon: number;
  tasks_completed: number;
  task_completion_rate: number;
  verification_total: number;
  verification_pending: number;
  verification_approved: number;
  verification_escalated: number;
  verification_rejected: number;
  verification_average_risk: number;
  verification_overrides: number;
  audit_event_count: number;
  contract_types: ReportDistributionItem[];
  active_task_priorities: ReportDistributionItem[];
  timeline: ReportTimelinePoint[];
  workload: ReportWorkloadItem[];
  recent_activity: ReportActivityItem[];
};
