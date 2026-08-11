import type {
  AuditEvent,
  Contract,
  ContractActivity,
  ContractComment,
  ContractDecision,
  ContractQuestionAnswer,
  ContractVersion,
  DealPassport,
  Job,
  LifecycleItem,
  Membership,
  NegotiationItem,
  NegotiationSummary,
  Notification,
  Organization,
  OrganizationSettings,
  PortfolioAnswer,
  ReportOverview,
  ReportRange,
  Review,
  User,
  VerificationCase,
  VerificationCaseSummary,
  WorkflowTask,
} from "./types";

export const DEMO_WORKSPACE_ID = "public-workspace";

export const demoUser: User = {
  id: "demo-viewer",
  email: "demo@lenslayer.app",
  display_name: "Demo viewer",
};

export const demoOrganization: Organization = {
  id: DEMO_WORKSPACE_ID,
  name: "Demo workspace",
  slug: "demo-workspace",
  role: "viewer",
  created_at: "2026-05-14T09:00:00.000Z",
};

function iso(daysFromNow: number, hour = 10) {
  const value = new Date();
  value.setDate(value.getDate() + daysFromNow);
  value.setHours(hour, 0, 0, 0);
  return value.toISOString();
}

function job(id: string, status: string, progress: string, error = ""): Job {
  return {
    id,
    kind: "contract_review",
    status,
    progress_step: progress,
    attempts: error ? 2 : 1,
    error_code: error ? "document_parse_failed" : "",
    error_message: error,
    created_at: iso(-12),
    started_at: iso(-12, 11),
    completed_at: ["ready", "failed", "reviewed"].includes(status) ? iso(-12, 12) : null,
  };
}

const contractSeed = [
  ["demo-msa", "Northstar Services MSA", "Northstar Systems", "Master services agreement", "reviewed", "northstar-msa-v3.pdf", -18],
  ["demo-supplier", "Harborline Supply Agreement", "Harborline Components", "Supply agreement", "ready", "harborline-supply.pdf", -9],
  ["demo-lease", "Riverside Office Lease", "Riverside Properties", "Commercial lease", "ready", "riverside-lease.pdf", -34],
  ["demo-dpa", "CloudArc Data Processing Addendum", "CloudArc Hosting", "Data processing addendum", "processing", "cloudarc-dpa.docx", -1],
  ["demo-marketing", "Brightfield Campaign Agreement", "Brightfield Studio", "Marketing services", "failed", "brightfield-scan.pdf", -3],
  ["demo-software", "LedgerPeak Software Subscription", "LedgerPeak Ltd", "Software subscription", "reviewed", "ledgerpeak-order-form.pdf", -27],
] as const;

export const demoContracts: Contract[] = contractSeed.map(([id, title, counterparty, contractType, status, sourceName, age], index) => {
  const error = status === "failed" ? "The scanned pages were incomplete. Upload a complete, readable copy." : "";
  return {
    id,
    organization_id: DEMO_WORKSPACE_ID,
    title,
    source_name: sourceName,
    counterparty,
    contract_type: contractType,
    status,
    review_context: {
      party_role: index === 2 ? "Tenant" : "Customer",
      jurisdiction: index === 2 ? "Lagos State" : "England and Wales",
      goal: "Identify material negotiation and operational issues",
      risk_tolerance: "Balanced",
    },
    retain_document: true,
    retain_source_text: status !== "failed",
    retention_days: 90,
    expires_at: iso(90 + index * 20),
    created_at: iso(age),
    updated_at: iso(Math.min(-1, age + 8)),
    latest_job: job(`job-${id}`, status, status === "processing" ? "Extracting clauses and source locations" : status === "failed" ? "Document parsing stopped" : "Review complete", error),
  };
});

const findingsByContract: Record<string, Review["analysis"]["risk_assessment"]> = {
  "demo-msa": [
    {
      title: "Unlimited indemnity for data claims",
      risk_level: "High",
      clause: "Customer indemnity",
      explanation: "The customer indemnity is not tied to the liability cap and could exceed the commercial value of the agreement.",
      recommendation: "Limit the indemnity to third-party claims caused by a verified breach and apply the negotiated liability cap.",
      confidence: "High",
      citation: "Section 12.3",
      page: 18,
      quote: "Customer shall indemnify Supplier against all losses arising from any data incident, without limitation.",
      suggested_language: "The indemnity in this section is subject to the aggregate liability cap in Section 13.2.",
    },
    {
      title: "Renewal notice is unusually early",
      risk_level: "Medium",
      clause: "Automatic renewal",
      explanation: "The agreement renews for another year unless notice is delivered 120 days before the term ends.",
      recommendation: "Request a 60-day notice window and assign an internal renewal owner.",
      confidence: "High",
      citation: "Section 3.2",
      page: 5,
      quote: "The Term shall renew automatically unless either party gives not less than 120 days' written notice.",
    },
  ],
  "demo-supplier": [{
    title: "Supplier can change delivery dates unilaterally",
    risk_level: "High",
    clause: "Delivery schedule",
    explanation: "The supplier may change committed dates without customer approval or a service remedy.",
    recommendation: "Require written agreement for material changes and add a cancellation right for delays beyond 15 days.",
    confidence: "High",
    citation: "Clause 6.4",
    page: 9,
    quote: "Delivery dates are estimates only and may be revised by Supplier at any time.",
  }],
  "demo-lease": [{
    title: "Break option requires strict notice service",
    risk_level: "Medium",
    clause: "Tenant break right",
    explanation: "The break right fails if notice is late or delivered to the wrong address.",
    recommendation: "Calendar the notice deadline and verify the service address with counsel before delivery.",
    confidence: "High",
    citation: "Schedule 4, paragraph 2",
    page: 31,
    quote: "The break notice must be received at the Landlord's registered office no later than six months before the Break Date.",
  }],
  "demo-software": [{
    title: "Usage fees can increase during the term",
    risk_level: "Medium",
    clause: "Additional usage",
    explanation: "Overage pricing is linked to the supplier's current list price rather than the signed order form.",
    recommendation: "Fix overage rates for the subscription term or require advance approval for additional usage.",
    confidence: "Medium",
    citation: "Order Form, Pricing note 3",
    page: 2,
    quote: "Additional usage will be charged at the then-current standard rates.",
  }],
};

export function demoReview(contractId: string): Review | null {
  const contract = demoContracts.find((item) => item.id === contractId);
  if (!contract || !["ready", "reviewed"].includes(contract.status)) return null;
  const risks = findingsByContract[contractId] ?? [];
  return {
    id: `review-${contractId}`,
    analysis: {
      title: contract.title,
      contract_type: contract.contract_type,
      executive_summary: `${contract.title} is workable, but the cited terms need a human decision before signature or renewal. The review separates extracted evidence from reviewer conclusions.`,
      overall_attention: risks.some((item) => item.risk_level === "High") ? "High" : "Review",
      governing_law: String(contract.review_context.jurisdiction),
      parties_involved: ["Demo Company Ltd", contract.counterparty],
      risk_assessment: risks,
      obligations: [
        { party: "Demo Company Ltd", obligation: "Maintain current security contacts", timing: "Throughout the term", source: "Section 8.1" },
        { party: contract.counterparty, obligation: "Provide quarterly service reporting", timing: "Within 10 business days of quarter end", source: "Schedule 2" },
      ],
      deadlines: [
        { title: "Renewal notice", date: iso(24).slice(0, 10), source: "Section 3.2", status: "Human-confirmed" },
      ],
      payments: [{ title: "Quarterly service fee", amount: "GBP 18,000", timing: "Quarterly in advance", source: "Order Form" }],
      negotiation_priorities: risks.map((item) => ({ priority: item.title, ask: item.recommendation, evidence: item.citation })),
      missing_protections: [{ issue: "Service credit mechanism", explanation: "No automatic remedy was detected for repeated service failure.", verification_note: "Confirm whether the order form contains a separate service-level schedule." }],
      uncertainties: [{ title: "Signature schedule", description: "The execution page appears incomplete in the uploaded copy." }],
      playbook_evaluation: { playbook_name: "Balanced commercial review", summary: { escalate: 1, review: 1, within_guardrail: 4 }, deviations: [] },
    },
    quality: { quality: "Good", evidence_coverage: 96, warnings: [] },
    source_text_retained: true,
    created_at: contract.created_at,
    updated_at: contract.updated_at,
  };
}

export const demoTasks: WorkflowTask[] = [
  { id: "task-overdue", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-msa", contract_title: "Northstar Services MSA", created_by_user_id: "demo-aisha", assigned_to_user_id: "demo-chidi", assigned_to_name: "Chidi Okafor", assigned_to_email: "chidi@example.test", title: "Confirm liability cap position", description: "Decide whether the data indemnity must sit inside the aggregate cap.", category: "risk", priority: "high", status: "in_progress", due_at: iso(-2), source_kind: "finding", source_reference: { citation: "Section 12.3" }, completed_at: null, created_at: iso(-10), updated_at: iso(-2) },
  { id: "task-renewal", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-lease", contract_title: "Riverside Office Lease", created_by_user_id: "demo-aisha", assigned_to_user_id: "demo-tomi", assigned_to_name: "Tomi Adeyemi", assigned_to_email: "tomi@example.test", title: "Prepare break notice checklist", description: "Verify service address and delivery method with counsel.", category: "deadline", priority: "high", status: "open", due_at: iso(5), source_kind: "deadline", source_reference: { citation: "Schedule 4, paragraph 2" }, completed_at: null, created_at: iso(-8), updated_at: iso(-1) },
  { id: "task-supplier", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-supplier", contract_title: "Harborline Supply Agreement", created_by_user_id: "demo-chidi", assigned_to_user_id: "demo-aisha", assigned_to_name: "Aisha Bello", assigned_to_email: "aisha@example.test", title: "Send revised delivery language", description: "Add approval and cancellation protections for material delay.", category: "negotiation", priority: "normal", status: "open", due_at: iso(9), source_kind: "finding", source_reference: { citation: "Clause 6.4" }, completed_at: null, created_at: iso(-5), updated_at: iso(-1) },
  { id: "task-dpa", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-dpa", contract_title: "CloudArc Data Processing Addendum", created_by_user_id: "demo-system", assigned_to_user_id: "demo-nneka", assigned_to_name: "Nneka Mensah", assigned_to_email: "nneka@example.test", title: "Check processing result", description: "Review the DPA when clause extraction completes.", category: "follow_up", priority: "normal", status: "open", due_at: iso(3), source_kind: "processing", source_reference: {}, completed_at: null, created_at: iso(-1), updated_at: iso(-1) },
  { id: "task-complete", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-software", contract_title: "LedgerPeak Software Subscription", created_by_user_id: "demo-aisha", assigned_to_user_id: "demo-chidi", assigned_to_name: "Chidi Okafor", assigned_to_email: "chidi@example.test", title: "Record final overage position", description: "Document the accepted fixed overage rate.", category: "negotiation", priority: "normal", status: "done", due_at: iso(-6), source_kind: "decision", source_reference: { citation: "Order Form, Pricing note 3" }, completed_at: iso(-7), created_at: iso(-16), updated_at: iso(-7) },
];

export const demoLifecycle: LifecycleItem[] = [
  { id: "life-renewal", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-msa", contract_title: "Northstar Services MSA", kind: "notice", title: "Serve non-renewal notice", description: "Notice must be received before the automatic renewal window closes.", amount: "", due_at: iso(24), owner_user_id: "demo-chidi", owner_name: "Chidi Okafor", reminder_days: 30, recurrence: "none", status: "active", last_notified_at: null, escalated_at: null, completed_at: null, created_at: iso(-18), updated_at: iso(-2) },
  { id: "life-lease", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-lease", contract_title: "Riverside Office Lease", kind: "notice", title: "Break notice deadline", description: "Confirm the service address before sending notice.", amount: "", due_at: iso(42), owner_user_id: "demo-tomi", owner_name: "Tomi Adeyemi", reminder_days: 60, recurrence: "none", status: "active", last_notified_at: null, escalated_at: null, completed_at: null, created_at: iso(-34), updated_at: iso(-3) },
  { id: "life-payment", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-supplier", contract_title: "Harborline Supply Agreement", kind: "payment", title: "Quarterly minimum order", description: "Finance to confirm forecast before purchase order release.", amount: "GBP 45,000", due_at: iso(16), owner_user_id: "demo-nneka", owner_name: "Nneka Mensah", reminder_days: 14, recurrence: "quarterly", status: "active", last_notified_at: null, escalated_at: null, completed_at: null, created_at: iso(-9), updated_at: iso(-1) },
];

export const demoMembers: Membership[] = [
  { id: "member-aisha", user_id: "demo-aisha", email: "aisha@example.test", display_name: "Aisha Bello", role: "owner", created_at: iso(-88) },
  { id: "member-chidi", user_id: "demo-chidi", email: "chidi@example.test", display_name: "Chidi Okafor", role: "reviewer", created_at: iso(-76) },
  { id: "member-tomi", user_id: "demo-tomi", email: "tomi@example.test", display_name: "Tomi Adeyemi", role: "reviewer", created_at: iso(-55) },
  { id: "member-nneka", user_id: "demo-nneka", email: "nneka@example.test", display_name: "Nneka Mensah", role: "viewer", created_at: iso(-41) },
];

export const demoNotifications: Notification[] = [
  { id: "note-review", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-supplier", kind: "review_ready", title: "Harborline review is ready", message: "One high-attention finding needs a human decision.", action_url: "/contracts/demo-supplier", read_at: null, created_at: iso(-1, 9) },
  { id: "note-overdue", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-msa", kind: "task_overdue", title: "Liability cap action is overdue", message: "The assigned action was due two days ago.", action_url: "/tasks", read_at: null, created_at: iso(-1, 8) },
  { id: "note-failed", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-marketing", kind: "review_failed", title: "Brightfield review needs a new file", message: "The scan was incomplete and could not be parsed.", action_url: "/contracts/demo-marketing", read_at: iso(-1, 12), created_at: iso(-3) },
];

const verificationSummaries: VerificationCaseSummary[] = [
  { id: "verify-ade", organization_id: DEMO_WORKSPACE_ID, reference: "IDV-1042", applicant_name: "Ade Williams", applicant_email: "ade@example.test", status: "in_review", priority: "high", assigned_to_user_id: "demo-tomi", assigned_to_name: "Tomi Adeyemi", assigned_to_email: "tomi@example.test", intake_channel: "secure_link", risk_score: 62, suggested_action: "Escalate", finding_count: 2, document_count: 3, average_confidence: 91, submitted_at: iso(-4), synthetic: true, due_at: iso(2), expires_at: iso(86), closed_at: null, latest_decision: null, created_at: iso(-4), updated_at: iso(-1) },
  { id: "verify-maya", organization_id: DEMO_WORKSPACE_ID, reference: "IDV-1038", applicant_name: "Maya Chen", applicant_email: "maya@example.test", status: "approved", priority: "normal", assigned_to_user_id: "demo-chidi", assigned_to_name: "Chidi Okafor", assigned_to_email: "chidi@example.test", intake_channel: "email", risk_score: 8, suggested_action: "Approve", finding_count: 0, document_count: 2, average_confidence: 98, submitted_at: iso(-8), synthetic: true, due_at: null, expires_at: iso(82), closed_at: iso(-6), latest_decision: { id: "decision-maya", decision: "Approve", rationale: "Names, dates, and addresses match across the submitted records.", recommended_action: "Approve", reviewer_user_id: "demo-chidi", reviewer_name: "Chidi Okafor", reviewer_email: "chidi@example.test", created_at: iso(-6) }, created_at: iso(-8), updated_at: iso(-6) },
  { id: "verify-luca", organization_id: DEMO_WORKSPACE_ID, reference: "IDV-1034", applicant_name: "Luca Marin", applicant_email: "luca@example.test", status: "needs_information", priority: "urgent", assigned_to_user_id: "demo-tomi", assigned_to_name: "Tomi Adeyemi", assigned_to_email: "tomi@example.test", intake_channel: "whatsapp", risk_score: 84, suggested_action: "Reject", finding_count: 3, document_count: 2, average_confidence: 87, submitted_at: iso(-11), synthetic: true, due_at: iso(1), expires_at: iso(79), closed_at: null, latest_decision: null, created_at: iso(-11), updated_at: iso(-2) },
];

export const demoVerificationCases = verificationSummaries;

export function demoVerificationCase(caseId: string): VerificationCase | null {
  const summary = verificationSummaries.find((item) => item.id === caseId);
  if (!summary) return null;
  const hasConflict = summary.risk_score >= 50;
  const finding = hasConflict ? [{
    code: "identity_address_conflict",
    title: "Address differs across evidence",
    severity: summary.risk_score > 75 ? "High" as const : "Medium" as const,
    points: summary.risk_score > 75 ? 35 : 20,
    explanation: "The application address does not match the most recent supporting document.",
    action: "Request current address evidence and record which source is authoritative.",
    evidence: [
      { document: "Application form", reference: "Address", field: "address", value: "14 Market Street", confidence: 1 },
      { document: "Utility statement", reference: "Service address", field: "address", value: "41 Market Street", confidence: 0.93 },
    ],
  }] : [];
  return {
    ...summary,
    application: { full_name: summary.applicant_name, email: summary.applicant_email, address: "14 Market Street", date_of_birth: "1991-05-18" },
    documents: [{ type: "identity", label: "Passport", reference: "Photo page", confidence: 0.97, fields: { full_name: summary.applicant_name, date_of_birth: "1991-05-18" } }],
    summary: hasConflict ? "One material discrepancy needs a reviewer to reconcile the submitted address evidence." : "The supplied identity fields align across the synthetic evidence set.",
    reasoning: hasConflict ? "The mismatch is explainable but cannot be resolved from the current sources alone." : "All required fields matched and extraction confidence remained high.",
    findings: finding,
    field_matrix: [{ field: "Full name", application: summary.applicant_name, passport: summary.applicant_name }, { field: "Address", application: "14 Market Street", supporting_document: hasConflict ? "41 Market Street" : "14 Market Street" }],
    generated_at: summary.updated_at,
    decision_history: summary.latest_decision ? [summary.latest_decision] : [],
    uploaded_documents: [{ id: `document-${caseId}`, document_type: "passport", original_name: `${summary.reference.toLowerCase()}-passport.pdf`, content_type: "application/pdf", size_bytes: 248000, sha256: "7b3f90a5bde2f4d03f14ea7eb3d9179bc91490ee14fb12e3fd304af886ec21aa", status: "ready", scan_status: "clean", extraction_status: "ready", extracted_fields: { full_name: summary.applicant_name }, confidence: summary.average_confidence, uploaded_by_user_id: null, uploaded_by_name: "Secure demo intake", expires_at: summary.expires_at, created_at: summary.created_at, updated_at: summary.updated_at }],
    assignment_history: [{ id: `assignment-${caseId}`, assigned_to_user_id: summary.assigned_to_user_id, assigned_to_name: summary.assigned_to_name, assigned_to_email: summary.assigned_to_email, assigned_by_user_id: "demo-aisha", assigned_by_name: "Aisha Bello", note: "Review the synthetic evidence and record the reason for the outcome.", created_at: summary.created_at }],
    reconciliations: [{ id: `reconciliation-${caseId}`, field_name: "address", canonical_value: hasConflict ? "" : "14 Market Street", status: hasConflict ? "conflict" : "matched", sources: [], resolution_note: hasConflict ? "Awaiting updated proof of address." : "Matched across retained sources.", resolved_by_user_id: hasConflict ? null : "demo-chidi", resolved_by_name: hasConflict ? "" : "Chidi Okafor", resolved_at: hasConflict ? null : summary.updated_at, created_at: summary.created_at, updated_at: summary.updated_at }],
  };
}

export function demoJobs(contractId: string): Job[] {
  const current = demoContracts.find((item) => item.id === contractId)?.latest_job;
  return current ? [current] : [];
}

export function demoTasksFor(contractId?: string | null): WorkflowTask[] {
  return contractId ? demoTasks.filter((item) => item.contract_id === contractId) : demoTasks;
}

export function demoLifecycleFor(contractId?: string | null): LifecycleItem[] {
  return contractId ? demoLifecycle.filter((item) => item.contract_id === contractId) : demoLifecycle;
}

export function demoContractAnswer(contractId: string): ContractQuestionAnswer {
  const review = demoReview(contractId);
  const finding = review?.analysis.risk_assessment?.[0];
  if (!finding) {
    return {
      answer: "The retained review does not contain enough cited evidence to support that answer.",
      generated_by: "extractive",
      sources: [],
    };
  }
  return {
    answer: `${finding.title}: ${finding.explanation} The recorded next step is to ${String(finding.recommendation).replace(/^./, (letter) => letter.toLowerCase())}`,
    generated_by: "extractive",
    sources: [{ label: demoContracts.find((item) => item.id === contractId)?.title ?? "Sample contract", location: String(finding.citation ?? finding.location ?? "Source excerpt"), excerpt: String(finding.quote ?? finding.evidence ?? finding.clause ?? "") }],
  };
}

export const demoPortfolioAnswer: PortfolioAnswer = {
  answer: "Three agreements contain a renewal or notice obligation. Northstar requires 120 days' notice, Riverside requires a break notice six months before the break date, and LedgerPeak requires 60 days' notice before subscription renewal. The Northstar and Riverside dates are already tracked in the demo calendar.",
  generated_by: "extractive",
  sources: [
    { contract_id: "demo-msa", contract_title: "Northstar Services MSA", location: "Section 3.2, page 5", excerpt: "The Term shall renew automatically unless either party gives not less than 120 days' written notice." },
    { contract_id: "demo-lease", contract_title: "Riverside Office Lease", location: "Schedule 4, paragraph 2, page 31", excerpt: "The break notice must be received at the Landlord's registered office no later than six months before the Break Date." },
    { contract_id: "demo-software", contract_title: "LedgerPeak Software Subscription", location: "Order Form, Term", excerpt: "Either party may prevent renewal by providing written notice at least 60 days before the end of the current subscription term." },
  ],
};

export function demoComments(contractId: string): ContractComment[] {
  if (contractId !== "demo-msa") return [];
  return [{ id: "comment-msa", body: "Procurement confirmed the supplier will consider putting the data indemnity inside the cap. Waiting for revised language.", mentioned_user_ids: ["demo-chidi"], author_user_id: "demo-aisha", author_name: "Aisha Bello", author_email: "aisha@example.test", created_at: iso(-4), updated_at: iso(-4) }];
}

export function demoDecisions(contractId: string): ContractDecision[] {
  if (contractId === "demo-software") return [{ id: "decision-software", decision: "accept", subject: "Fixed overage rate", rationale: "The counterparty accepted a fixed overage schedule for the initial term. Evidence recorded in Order Form, Pricing note 3.", source_reference: { citation: "Order Form, Pricing note 3" }, reviewer_user_id: "demo-chidi", reviewer_name: "Chidi Okafor", reviewer_email: "chidi@example.test", created_at: iso(-7) }];
  if (contractId === "demo-msa") return [{ id: "decision-msa", decision: "change", subject: "Data indemnity", rationale: "Request revised wording because Section 12.3 is currently outside the aggregate liability cap.", source_reference: { citation: "Section 12.3, page 18" }, reviewer_user_id: "demo-aisha", reviewer_name: "Aisha Bello", reviewer_email: "aisha@example.test", created_at: iso(-5) }];
  return [];
}

export function demoNegotiationItems(contractId: string): NegotiationItem[] {
  if (contractId !== "demo-msa") return [];
  return [
    { id: "neg-msa-cap", contract_id: contractId, title: "Apply liability cap to data indemnity", description: "Tie third-party data claims to the negotiated aggregate cap.", category: "legal", priority: "high", status: "unresolved", our_position: "All indemnities remain subject to the aggregate cap, except deliberate misconduct.", counterparty_position: "Data indemnity remains uncapped.", source_reference: { citation: "Section 12.3" }, created_by_user_id: "demo-aisha", created_by_name: "Aisha Bello", resolved_at: null, created_at: iso(-8), updated_at: iso(-2) },
    { id: "neg-msa-renewal", contract_id: contractId, title: "Reduce renewal notice", description: "Shorten the notice period from 120 to 60 days.", category: "commercial", priority: "normal", status: "accepted", our_position: "60 days", counterparty_position: "Agreed to 60 days", source_reference: { citation: "Section 3.2" }, created_by_user_id: "demo-chidi", created_by_name: "Chidi Okafor", resolved_at: iso(-3), created_at: iso(-8), updated_at: iso(-3) },
  ];
}

export function demoNegotiationSummary(contractId: string): NegotiationSummary {
  const items = demoNegotiationItems(contractId);
  return {
    contract_id: contractId,
    latest_version: demoVersions(contractId)[0] ?? null,
    version_count: demoVersions(contractId).length,
    checklist_count: items.length,
    accepted_changes: items.filter((item) => item.status === "accepted"),
    rejected_changes: items.filter((item) => item.status === "rejected"),
    unresolved_points: items.filter((item) => item.status === "unresolved"),
    counterparty_response_count: contractId === "demo-msa" ? 1 : 0,
    final_summary: items.length ? "Renewal notice is agreed. The data indemnity cap remains unresolved and requires a legal decision before signature." : "No negotiation record is attached to this sample agreement.",
  };
}

export function demoVersions(contractId: string): ContractVersion[] {
  if (contractId !== "demo-msa") return [];
  return [
    { id: "version-msa-2", contract_id: contractId, document_asset_id: "asset-msa-2", version_number: 2, label: "Counterparty revision", notes: "Renewal notice changed to 60 days.", source_name: "northstar-msa-v3.pdf", sha256: "3b284481d28c981aebacb501901a101e59397d2be073de7a4522a3845ac79900", size_bytes: 492000, comparison: { compared_to_version_id: "version-msa-1", added: ["60-day renewal notice"], removed: ["120-day renewal notice"], changed_summary: "The renewal notice was reduced. The uncapped data indemnity remains unchanged.", added_count: 1, removed_count: 1 }, uploaded_by_user_id: "demo-chidi", uploaded_by_name: "Chidi Okafor", created_at: iso(-3) },
    { id: "version-msa-1", contract_id: contractId, document_asset_id: "asset-msa-1", version_number: 1, label: "Initial draft", notes: "First supplier draft.", source_name: "northstar-msa-v1.pdf", sha256: "16811d23a08c9b7192a50840318ce066411fabe7b041eea35bbfb4517b31f2f1", size_bytes: 478000, comparison: { compared_to_version_id: null, added: [], removed: [], changed_summary: "Initial version", added_count: 0, removed_count: 0 }, uploaded_by_user_id: "demo-aisha", uploaded_by_name: "Aisha Bello", created_at: iso(-18) },
  ];
}

export function demoActivity(contractId: string): ContractActivity[] {
  const contract = demoContracts.find((item) => item.id === contractId);
  if (!contract) return [];
  return [
    { id: `activity-${contractId}-review`, action: contract.status === "failed" ? "contract.review_failed" : "contract.review_ready", detail: { title: contract.title, status: contract.status }, actor_user_id: null, actor_name: "LensLayer processing", created_at: contract.updated_at },
    { id: `activity-${contractId}-created`, action: "contract.created", detail: { source_name: contract.source_name }, actor_user_id: "demo-aisha", actor_name: "Aisha Bello", created_at: contract.created_at },
  ];
}

export function demoVerificationAudit(caseId: string): AuditEvent[] {
  const item = verificationSummaries.find((entry) => entry.id === caseId);
  if (!item) return [];
  return [
    { id: `audit-${caseId}-assigned`, action: "verification.case_assigned", detail: { assigned_to: item.assigned_to_name }, actor_user_id: "demo-aisha", actor_name: "Aisha Bello", actor_email: "aisha@example.test", contract_id: null, verification_case_id: caseId, created_at: item.created_at },
    { id: `audit-${caseId}-reconciled`, action: "verification.evidence_reconciled", detail: { fields_checked: 4, unresolved: item.finding_count }, actor_user_id: item.assigned_to_user_id, actor_name: item.assigned_to_name, actor_email: item.assigned_to_email, contract_id: null, verification_case_id: caseId, created_at: item.updated_at },
  ];
}

export function demoDealPassport(contractId: string): DealPassport {
  const contract = demoContracts.find((item) => item.id === contractId)!;
  const review = demoReview(contractId);
  const tasks = demoTasksFor(contractId).filter((item) => item.status !== "done");
  const dates = demoLifecycleFor(contractId);
  return {
    contract_id: contractId,
    title: contract.title,
    counterparty: contract.counterparty,
    contract_type: contract.contract_type,
    readiness: tasks.some((item) => item.priority === "high") ? "needs_attention" : "ready",
    readiness_reasons: tasks.map((item) => item.title),
    executive_summary: review?.analysis.executive_summary ?? "Review is not ready.",
    overall_attention: String(review?.analysis.overall_attention ?? "Pending"),
    top_risks: review?.analysis.risk_assessment?.slice(0, 3) ?? [],
    versions: demoVersions(contractId),
    negotiation: demoNegotiationSummary(contractId),
    approvals: [],
    open_actions: tasks.map((item) => ({ id: item.id, title: item.title, priority: item.priority, status: item.status, owner: item.assigned_to_name ?? "Unassigned", due_at: item.due_at })),
    key_dates: dates.map((item) => ({ id: item.id, kind: item.kind, title: item.title, due_at: item.due_at, owner: item.owner_name ?? "Unassigned" })),
    generated_at: iso(0),
  };
}

export function demoReport(range: ReportRange): ReportOverview {
  const generatedAt = iso(0);
  return {
    organization_id: DEMO_WORKSPACE_ID,
    range,
    generated_at: generatedAt,
    period_start: range === "all" ? null : iso(range === "30d" ? -30 : range === "90d" ? -90 : -365),
    period_end: generatedAt,
    contracts_total: 6,
    contracts_ready: 2,
    contracts_processing: 1,
    contracts_failed: 1,
    review_completed_count: 4,
    average_review_completion_hours: 3.4,
    upcoming_obligations: 3,
    material_findings_total: 8,
    evidence_backed_findings: 7,
    evidence_coverage: 88,
    tasks_total: 5,
    tasks_active: 4,
    tasks_overdue: 1,
    tasks_due_soon: 2,
    tasks_completed: 1,
    task_completion_rate: 20,
    verification_total: 3,
    verification_pending: 2,
    verification_approved: 1,
    verification_escalated: 0,
    verification_rejected: 0,
    verification_average_risk: 51,
    verification_overrides: 0,
    audit_event_count: 24,
    contract_types: [{ label: "Services", count: 2 }, { label: "Supply", count: 1 }, { label: "Lease", count: 1 }, { label: "Data processing", count: 1 }, { label: "Software", count: 1 }],
    active_task_priorities: [{ label: "high", count: 2 }, { label: "normal", count: 2 }],
    timeline: [
      { label: "Week 1", period_start: iso(-28), period_end: iso(-22), contracts_created: 1, tasks_created: 1, tasks_completed: 0, verification_submitted: 1, decisions_recorded: 0 },
      { label: "Week 2", period_start: iso(-21), period_end: iso(-15), contracts_created: 2, tasks_created: 1, tasks_completed: 0, verification_submitted: 0, decisions_recorded: 1 },
      { label: "Week 3", period_start: iso(-14), period_end: iso(-8), contracts_created: 2, tasks_created: 2, tasks_completed: 1, verification_submitted: 2, decisions_recorded: 1 },
      { label: "Week 4", period_start: iso(-7), period_end: iso(0), contracts_created: 1, tasks_created: 1, tasks_completed: 0, verification_submitted: 0, decisions_recorded: 2 },
    ],
    workload: demoMembers.map((member, index) => ({ user_id: member.user_id, display_name: member.display_name, email: member.email, role: member.role, active_tasks: [1, 1, 1, 1][index], overdue_tasks: index === 1 ? 1 : 0, completed_in_period: index === 1 ? 1 : 0 })),
    recent_activity: [
      { id: "report-review", action: "contract.review_ready", detail: { title: "Harborline Supply Agreement" }, actor_user_id: null, actor_name: "LensLayer processing", contract_id: "demo-supplier", contract_title: "Harborline Supply Agreement", created_at: iso(-1) },
      { id: "report-task", action: "task.updated", detail: { title: "Confirm liability cap position" }, actor_user_id: "demo-chidi", actor_name: "Chidi Okafor", contract_id: "demo-msa", contract_title: "Northstar Services MSA", created_at: iso(-2) },
      { id: "report-decision", action: "verification.decision_recorded", detail: { reference: "IDV-1038" }, actor_user_id: "demo-chidi", actor_name: "Chidi Okafor", contract_id: null, contract_title: null, created_at: iso(-6) },
    ],
  };
}

export const demoSettings: OrganizationSettings = {
  organization_id: DEMO_WORKSPACE_ID,
  name: demoOrganization.name,
  slug: demoOrganization.slug,
  default_retention_days: 90,
  default_retain_document: false,
  default_retain_source_text: true,
  notification_review_ready: true,
  notification_review_failed: true,
  updated_at: iso(-14),
};

export type DemoResponse =
  | { handled: false }
  | { handled: true; value: unknown }
  | { handled: true; error: string; status: number };

function contractPath(pathname: string) {
  return pathname.match(new RegExp(`^/organizations/${DEMO_WORKSPACE_ID}/contracts/([^/]+)(?:/(.*))?$`));
}

export function getDemoResponse(path: string, init?: RequestInit): DemoResponse {
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path, "https://lenslayer.local");
  const pathname = url.pathname;
  const workspacePrefix = `/organizations/${DEMO_WORKSPACE_ID}`;
  const isDemoPath = pathname === "/me" || pathname === "/organizations" || pathname.startsWith(`${workspacePrefix}/`);
  if (!isDemoPath) return { handled: false };

  if (pathname === "/me" && method === "GET") return { handled: true, value: demoUser };
  if (pathname === "/organizations" && method === "GET") return { handled: true, value: [demoOrganization] };
  if (method === "POST" && pathname === `${workspacePrefix}/portfolio/questions`) return { handled: true, value: demoPortfolioAnswer };

  const contractMatch = contractPath(pathname);
  if (method === "POST" && contractMatch?.[2] === "questions") return { handled: true, value: demoContractAnswer(contractMatch[1]) };
  if (method !== "GET") return { handled: true, error: "This read-only demo is isolated from private customer workspaces. Sign in to make changes in an authorised workspace.", status: 403 };

  if (pathname === `${workspacePrefix}/settings`) return { handled: true, value: demoSettings };
  if (pathname === `${workspacePrefix}/contracts`) return { handled: true, value: demoContracts };
  if (pathname === `${workspacePrefix}/tasks`) return { handled: true, value: demoTasksFor(url.searchParams.get("contract_id")) };
  if (pathname === `${workspacePrefix}/lifecycle`) return { handled: true, value: demoLifecycleFor(url.searchParams.get("contract_id")) };
  if (pathname === `${workspacePrefix}/members`) return { handled: true, value: demoMembers };
  if (pathname === `${workspacePrefix}/invitations`) return { handled: true, value: [] };
  if (pathname === `${workspacePrefix}/notifications`) return { handled: true, value: demoNotifications };
  if (pathname === `${workspacePrefix}/verification-cases`) return { handled: true, value: demoVerificationCases };
  if (pathname === `${workspacePrefix}/reports/overview`) return { handled: true, value: demoReport((url.searchParams.get("range") ?? "30d") as ReportRange) };

  const verificationMatch = pathname.match(new RegExp(`^${workspacePrefix}/verification-cases/([^/]+)(?:/(.*))?$`));
  if (verificationMatch) {
    if (verificationMatch[2] === "audit-events") return { handled: true, value: demoVerificationAudit(verificationMatch[1]) };
    const item = demoVerificationCase(verificationMatch[1]);
    return item ? { handled: true, value: item } : { handled: true, error: "This synthetic verification case does not exist.", status: 404 };
  }

  if (contractMatch) {
    const [, contractId, resource] = contractMatch;
    const contract = demoContracts.find((item) => item.id === contractId);
    if (!contract) return { handled: true, error: "This sample contract does not exist.", status: 404 };
    if (!resource) return { handled: true, value: contract };
    if (resource === "review") {
      const review = demoReview(contractId);
      return review ? { handled: true, value: review } : { handled: true, error: "A review is not available for this contract state.", status: 404 };
    }
    if (resource === "jobs") return { handled: true, value: demoJobs(contractId) };
    if (resource === "versions") return { handled: true, value: demoVersions(contractId) };
    if (resource === "negotiation-items") return { handled: true, value: demoNegotiationItems(contractId) };
    if (resource === "counterparty-responses") return { handled: true, value: contractId === "demo-msa" ? [{ id: "response-msa", contract_id: contractId, contract_version_id: "version-msa-2", recorded_by_user_id: "demo-chidi", recorded_by_name: "Chidi Okafor", responder_name: "Northstar legal team", channel: "email", body: "We accept the 60-day renewal notice. The data indemnity cap remains under review.", related_item_ids: ["neg-msa-cap", "neg-msa-renewal"], created_at: iso(-3) }] : [] };
    if (resource === "negotiation-summary") return { handled: true, value: demoNegotiationSummary(contractId) };
    if (resource === "deal-passport") return { handled: true, value: demoDealPassport(contractId) };
    if (resource === "comments") return { handled: true, value: demoComments(contractId) };
    if (resource === "decisions") return { handled: true, value: demoDecisions(contractId) };
    if (resource === "approvals" || resource === "shares") return { handled: true, value: [] };
    if (resource === "activity") return { handled: true, value: demoActivity(contractId) };
  }

  const emptyCollections = ["/integrations", "/integrations/imports", "/integrations/providers", "/api-keys", "/webhooks", "/webhook-deliveries", "/secure-intake-links"];
  if (emptyCollections.some((suffix) => pathname.endsWith(suffix))) return { handled: true, value: [] };
  return { handled: true, error: "This item is not part of the synthetic demo workspace.", status: 404 };
}
