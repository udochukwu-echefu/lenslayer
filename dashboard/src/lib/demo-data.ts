import type {
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
  WorkflowTask,
} from "./types";

import { DEMO_WORKSPACE_ID } from "./workspace-mode";

export const demoUser: User = {
  id: "demo-viewer",
  email: "demo@lenslayer.app",
  display_name: "Demo viewer",
};

export const demoOrganization: Organization = {
  id: DEMO_WORKSPACE_ID,
  name: "Adebayo Foods Ltd",
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
  ["demo-msa", "Barton IT support agreement", "Barton IT Services Ltd", "Master services agreement", "reviewed", "barton-it-support-revised.pdf", -18],
  ["demo-supplier", "Musa Packaging supply agreement", "Musa Packaging Ltd", "Supply agreement", "ready", "musa-packaging-supply.pdf", -9],
  ["demo-lease", "28 Allen Avenue office lease", "Olatunji Properties Ltd", "Commercial lease", "ready", "allen-avenue-lease.pdf", -34],
  ["demo-dpa", "Ellis Hosting data processing addendum", "Ellis Hosting Ltd", "Data processing addendum", "processing", "ellis-hosting-dpa.docx", -1],
  ["demo-marketing", "Kemi Dada Christmas campaign", "Kemi Dada Studio", "Marketing services", "failed", "kemi-dada-campaign-scan.pdf", -3],
  ["demo-software", "Palmer Payroll annual subscription", "Palmer Payroll Ltd", "Software subscription", "reviewed", "palmer-payroll-order-form.pdf", -27],
] as const;

const reviewContexts: Record<string, Contract["review_context"]> = {
  "demo-msa": { party_role: "Customer", jurisdiction: "England and Wales", goal: "Agree the liability cap before renewing our IT support", risk_tolerance: "Balanced" },
  "demo-supplier": { party_role: "Buyer", jurisdiction: "Lagos State", goal: "Keep carton deliveries on schedule for the Christmas orders", risk_tolerance: "Balanced" },
  "demo-lease": { party_role: "Tenant", jurisdiction: "Lagos State", goal: "Check the notice requirements before deciding whether to move", risk_tolerance: "Balanced" },
  "demo-dpa": { party_role: "Customer", jurisdiction: "England and Wales", goal: "Check how customer and staff data will be handled", risk_tolerance: "Balanced" },
  "demo-marketing": { party_role: "Customer", jurisdiction: "Lagos State", goal: "Confirm the deliverables, payment dates and rights to the campaign photos", risk_tolerance: "Balanced" },
  "demo-software": { party_role: "Customer", jurisdiction: "England and Wales", goal: "Confirm the annual cost and the rate for extra employees", risk_tolerance: "Balanced" },
};

export const demoContracts: Contract[] = contractSeed.map(([id, title, counterparty, contractType, status, sourceName, age], index) => {
  const error = status === "failed" ? "The scan cuts off the right side of several pages. Ask Kemi for the original PDF and upload it again." : "";
  return {
    id,
    organization_id: DEMO_WORKSPACE_ID,
    title,
    source_name: sourceName,
    counterparty,
    contract_type: contractType,
    status,
    review_context: reviewContexts[id],
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
      title: "Data claims sit outside the liability cap",
      risk_level: "High",
      clause: "Customer indemnity",
      explanation: "Section 12.3 makes Adebayo Foods responsible for all losses from a data incident. The cap in Section 13.2 does not cover this promise.",
      recommendation: "Ask Barton to apply the same liability cap to data claims. Chidi should check the revised clause before we sign.",
      confidence: "High",
      citation: "Section 12.3",
      page: 18,
      quote: "Customer shall indemnify Supplier against all losses arising from any data incident, without limitation.",
      suggested_language: "The indemnity in this section is subject to the aggregate liability cap in Section 13.2.",
    },
    {
      title: "Renewal needs 60 days' notice",
      risk_level: "Medium",
      clause: "Automatic renewal",
      explanation: "The revised draft gives us 60 days to stop the next annual renewal. Barton reduced this from 120 days after the last round of comments.",
      recommendation: "Chidi should get the renewal decision from Aisha before the notice deadline.",
      confidence: "High",
      citation: "Section 3.2",
      page: 5,
      quote: "The Term shall renew automatically unless either party gives not less than 60 days' written notice.",
    },
  ],
  "demo-supplier": [{
    title: "Musa can move delivery dates without our agreement",
    risk_level: "High",
    clause: "Delivery schedule",
    explanation: "Clause 6.4 treats every delivery date as an estimate. If the cartons arrive late, the clause gives us no right to cancel the order.",
    recommendation: "Ask Musa to confirm date changes in writing and let us cancel an order if delivery is more than 15 days late.",
    confidence: "High",
    citation: "Clause 6.4",
    page: 9,
    quote: "Delivery dates are estimates only and may be revised by Supplier at any time.",
  }],
  "demo-lease": [{
    title: "The landlord must receive notice six months ahead",
    risk_level: "Medium",
    clause: "Tenant break right",
    explanation: "We can leave at the break date only if Olatunji Properties receives the notice at its registered office at least six months beforehand.",
    recommendation: "Tomi should confirm the address and delivery method with our solicitor before posting the notice.",
    confidence: "High",
    citation: "Schedule 4, paragraph 2",
    page: 31,
    quote: "The break notice must be received at the Landlord's registered office no later than six months before the Break Date.",
  }],
  "demo-software": [{
    title: "Extra employees are charged at Palmer's current rate",
    risk_level: "Medium",
    clause: "Additional usage",
    explanation: "The signed order covers 50 employees. The original pricing note lets Palmer charge its current rate for anyone added during the year.",
    recommendation: "Keep Palmer's written confirmation of a fixed rate with the order form. Check that rate before adding more staff.",
    confidence: "Medium",
    citation: "Order Form, Pricing note 3",
    page: 2,
    quote: "Additional usage will be charged at the then-current standard rates.",
  }],
};

const reviewDetails: Record<string, Review["analysis"]> = {
  "demo-msa": {
    executive_summary: "The renewal draft covers another year of support for our office systems. Barton has agreed to 60 days' renewal notice, but the data indemnity is still outside the liability cap. Chidi needs to settle that point before Aisha signs.",
    obligations: [
      { party: "Adebayo Foods Ltd", obligation: "Keep Barton informed when the IT or security contact changes", timing: "Throughout the term", source: "Section 8.1" },
      { party: "Barton IT Services Ltd", obligation: "Send the service report, including downtime and open support tickets", timing: "Within 10 business days of each quarter end", source: "Schedule 2" },
    ],
    payments: [{ title: "IT support fee", amount: "GBP 3,600", timing: "Quarterly in advance", source: "Order Form" }],
    missing_protections: [{ issue: "No credit for missed response times", explanation: "The support schedule lists response times but does not say what happens if Barton misses them.", verification_note: "Ask whether a separate service-level schedule forms part of the agreement." }],
    uncertainties: [{ title: "Unsigned draft", description: "Neither party has signed the revised copy yet." }],
  },
  "demo-supplier": {
    executive_summary: "Musa will supply cartons for our Christmas orders, with a minimum spend of NGN 4.5 million each quarter. The main issue is delivery: Musa can change dates without our agreement. Aisha should settle the late-delivery wording before placing the first order.",
    obligations: [
      { party: "Adebayo Foods Ltd", obligation: "Send the next quarter's carton forecast before placing orders", timing: "Before the start of each quarter", source: "Schedule 1" },
      { party: "Musa Packaging Ltd", obligation: "Supply cartons to the sizes and print specification in the order", timing: "For each delivery", source: "Clause 4.2" },
    ],
    payments: [{ title: "Minimum carton orders", amount: "NGN 4,500,000", timing: "Each quarter", source: "Schedule 1" }],
    missing_protections: [{ issue: "No cancellation right for late delivery", explanation: "Clause 6.4 allows Musa to move delivery dates but gives us no way to cancel a delayed order.", verification_note: "Check the revised clause before issuing the purchase order." }],
    uncertainties: [{ title: "Delivery schedule missing", description: "The agreement refers to an order schedule, but that schedule was not included in the PDF." }],
  },
  "demo-lease": {
    executive_summary: "The Allen Avenue office lease has a break option, but the landlord must receive notice six months before the break date. Tomi needs to confirm how and where to send it. The annual rent is NGN 18 million; the service charge is billed separately.",
    obligations: [
      { party: "Adebayo Foods Ltd", obligation: "Keep the office in repair and obtain consent before making alterations", timing: "Throughout the lease", source: "Clause 5.3" },
      { party: "Olatunji Properties Ltd", obligation: "Maintain the common areas and building services", timing: "Throughout the lease", source: "Clause 7.1" },
    ],
    payments: [{ title: "Office rent", amount: "NGN 18,000,000", timing: "Annually in advance", source: "Schedule 2" }],
    missing_protections: [{ issue: "Service charge has no annual limit", explanation: "Building costs are passed on separately from rent, with no ceiling stated in the lease.", verification_note: "Ask the landlord for last year's accounts and this year's budget." }],
    uncertainties: [{ title: "Service address needs checking", description: "Confirm the landlord's current registered office with our solicitor before serving notice." }],
  },
  "demo-software": {
    executive_summary: "Palmer's annual subscription covers payroll for 50 employees at GBP 2,400. Chidi has recorded Palmer's agreement to hold the extra-employee rate for this year. Keep that confirmation with the order form and review the headcount before renewal.",
    obligations: [
      { party: "Adebayo Foods Ltd", obligation: "Submit approved payroll changes before the monthly cut-off", timing: "By the 20th of each month", source: "Schedule 1" },
      { party: "Palmer Payroll Ltd", obligation: "Provide payslips and the payroll report for review", timing: "Each monthly payroll run", source: "Schedule 1" },
    ],
    payments: [{ title: "Payroll subscription, up to 50 employees", amount: "GBP 2,400", timing: "Annually in advance", source: "Order Form" }],
    missing_protections: [],
    uncertainties: [{ title: "Extra-employee rate confirmed separately", description: "The fixed rate is recorded in Chidi's decision. Keep the supplier's written confirmation alongside the original pricing note." }],
  },
};

export function demoReview(contractId: string): Review | null {
  const contract = demoContracts.find((item) => item.id === contractId);
  if (!contract || !["ready", "reviewed"].includes(contract.status)) return null;
  const risks = findingsByContract[contractId] ?? [];
  return {
    id: `review-${contractId}`,
    analysis: {
      ...reviewDetails[contractId],
      title: contract.title,
      contract_type: contract.contract_type,
      overall_attention: risks.some((item) => item.risk_level === "High") ? "High" : "Review",
      governing_law: String(contract.review_context.jurisdiction),
      parties_involved: [demoOrganization.name, contract.counterparty],
      risk_assessment: risks,
      deadlines: contractId === "demo-msa" ? [{ title: "Renewal notice", date: iso(24).slice(0, 10), source: "Section 3.2", status: "Human-confirmed" }]
        : contractId === "demo-lease" ? [{ title: "Break notice", date: iso(42).slice(0, 10), source: "Schedule 4, paragraph 2", status: "Human-confirmed" }]
        : contractId === "demo-supplier" ? [{ title: "Next quarter's carton order", date: iso(16).slice(0, 10), source: "Schedule 1", status: "Human-confirmed" }] : [],
      negotiation_priorities: risks.map((item) => ({ priority: item.title, ask: item.recommendation, evidence: item.citation })),
      playbook_evaluation: { playbook_name: "Adebayo Foods contract checklist", summary: { escalate: risks.filter((item) => item.risk_level === "High").length, review: risks.filter((item) => item.risk_level !== "High").length }, deviations: [] },
    },
    quality: { quality: "Good", evidence_coverage: 96, warnings: [] },
    source_text_retained: true,
    created_at: contract.created_at,
    updated_at: contract.updated_at,
  };
}

export const demoTasks: WorkflowTask[] = [
  { id: "task-overdue", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-msa", contract_title: "Barton IT support agreement", created_by_user_id: "demo-aisha", assigned_to_user_id: "demo-chidi", assigned_to_name: "Chidi Okafor", assigned_to_email: "chidi@example.test", title: "Agree the cap on data claims with Barton", description: "Ask Helen to include data claims in Section 13.2, then send the revised clause to Aisha before signing.", category: "risk", priority: "high", status: "in_progress", due_at: iso(-2), source_kind: "finding", source_reference: { citation: "Section 12.3" }, completed_at: null, created_at: iso(-10), updated_at: iso(-2) },
  { id: "task-renewal", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-lease", contract_title: "28 Allen Avenue office lease", created_by_user_id: "demo-aisha", assigned_to_user_id: "demo-tomi", assigned_to_name: "Tomi Adeyemi", assigned_to_email: "tomi@example.test", title: "Check where to send the office break notice", description: "Confirm Olatunji Properties' registered office and the delivery method with our solicitor. Keep proof of delivery with the lease.", category: "deadline", priority: "high", status: "open", due_at: iso(5), source_kind: "deadline", source_reference: { citation: "Schedule 4, paragraph 2" }, completed_at: null, created_at: iso(-8), updated_at: iso(-1) },
  { id: "task-supplier", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-supplier", contract_title: "Musa Packaging supply agreement", created_by_user_id: "demo-chidi", assigned_to_user_id: "demo-aisha", assigned_to_name: "Aisha Bello", assigned_to_email: "aisha@example.test", title: "Send Musa our changes to the delivery clause", description: "Ask for written agreement to date changes and a right to cancel if the cartons are more than 15 days late.", category: "negotiation", priority: "normal", status: "open", due_at: iso(9), source_kind: "finding", source_reference: { citation: "Clause 6.4" }, completed_at: null, created_at: iso(-5), updated_at: iso(-1) },
  { id: "task-dpa", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-dpa", contract_title: "Ellis Hosting data processing addendum", created_by_user_id: "demo-system", assigned_to_user_id: "demo-nneka", assigned_to_name: "Nneka Mensah", assigned_to_email: "nneka@example.test", title: "Review the Ellis Hosting DPA", description: "Once the review is ready, check the list of subprocessors and where customer data will be stored.", category: "follow_up", priority: "normal", status: "open", due_at: iso(3), source_kind: "processing", source_reference: {}, completed_at: null, created_at: iso(-1), updated_at: iso(-1) },
  { id: "task-complete", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-software", contract_title: "Palmer Payroll annual subscription", created_by_user_id: "demo-aisha", assigned_to_user_id: "demo-chidi", assigned_to_name: "Chidi Okafor", assigned_to_email: "chidi@example.test", title: "File Palmer's confirmation of the extra-employee rate", description: "Saved Palmer's email confirming GBP 48 per extra employee for the current subscription year.", category: "negotiation", priority: "normal", status: "done", due_at: iso(-6), source_kind: "decision", source_reference: { citation: "Order Form, Pricing note 3" }, completed_at: iso(-7), created_at: iso(-16), updated_at: iso(-7) },
];

export const demoLifecycle: LifecycleItem[] = [
  { id: "life-renewal", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-msa", contract_title: "Barton IT support agreement", kind: "notice", title: "Barton renewal notice due", description: "If we decide not to renew, Barton must receive written notice by this date. Chidi to confirm the decision with Aisha first.", amount: "", due_at: iso(24), owner_user_id: "demo-chidi", owner_name: "Chidi Okafor", reminder_days: 30, recurrence: "none", status: "active", last_notified_at: null, escalated_at: null, completed_at: null, created_at: iso(-18), updated_at: iso(-2) },
  { id: "life-lease", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-lease", contract_title: "28 Allen Avenue office lease", kind: "notice", title: "Allen Avenue break notice due", description: "The landlord must receive notice at its registered office. Tomi to confirm the address with our solicitor.", amount: "", due_at: iso(42), owner_user_id: "demo-tomi", owner_name: "Tomi Adeyemi", reminder_days: 60, recurrence: "none", status: "active", last_notified_at: null, escalated_at: null, completed_at: null, created_at: iso(-34), updated_at: iso(-3) },
  { id: "life-payment", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-supplier", contract_title: "Musa Packaging supply agreement", kind: "payment", title: "Confirm next quarter's carton order", description: "Nneka to check the forecast with the warehouse team before Aisha raises the purchase order.", amount: "NGN 4,500,000", due_at: iso(16), owner_user_id: "demo-nneka", owner_name: "Nneka Mensah", reminder_days: 14, recurrence: "quarterly", status: "active", last_notified_at: null, escalated_at: null, completed_at: null, created_at: iso(-9), updated_at: iso(-1) },
];

export const demoMembers: Membership[] = [
  { id: "member-aisha", user_id: "demo-aisha", email: "aisha@example.test", display_name: "Aisha Bello", role: "owner", created_at: iso(-88) },
  { id: "member-chidi", user_id: "demo-chidi", email: "chidi@example.test", display_name: "Chidi Okafor", role: "reviewer", created_at: iso(-76) },
  { id: "member-tomi", user_id: "demo-tomi", email: "tomi@example.test", display_name: "Tomi Adeyemi", role: "reviewer", created_at: iso(-55) },
  { id: "member-nneka", user_id: "demo-nneka", email: "nneka@example.test", display_name: "Nneka Mensah", role: "viewer", created_at: iso(-41) },
];

export const demoNotifications: Notification[] = [
  { id: "note-review", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-supplier", kind: "review_ready", title: "Musa Packaging review is ready", message: "Check Clause 6.4 before ordering: Musa can change delivery dates without our agreement.", action_url: "/contracts/demo-supplier", read_at: null, created_at: iso(-1, 9) },
  { id: "note-overdue", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-msa", kind: "task_overdue", title: "Barton liability cap: follow-up overdue", message: "Chidi was due to confirm the data-claims wording two days ago.", action_url: "/tasks", read_at: null, created_at: iso(-1, 8) },
  { id: "note-failed", organization_id: DEMO_WORKSPACE_ID, contract_id: "demo-marketing", kind: "review_failed", title: "The Kemi Dada scan needs replacing", message: "Several pages are cut off. Ask Kemi for the original PDF so we can finish the review.", action_url: "/contracts/demo-marketing", read_at: iso(-1, 12), created_at: iso(-3) },
];

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
      answer: "There isn't a completed review with source excerpts for this agreement yet.",
      generated_by: "extractive",
      sources: [],
    };
  }
  return {
    answer: `${finding.explanation} Next step: ${finding.recommendation}`,
    generated_by: "extractive",
    sources: [{ label: demoContracts.find((item) => item.id === contractId)?.title ?? "Sample contract", location: String(finding.citation ?? finding.location ?? "Source excerpt"), excerpt: String(finding.quote ?? finding.evidence ?? finding.clause ?? "") }],
  };
}

export const demoPortfolioAnswer: PortfolioAnswer = {
  answer: "Barton needs 60 days' notice before the IT support agreement renews. For the Allen Avenue lease, Olatunji Properties must receive a break notice six months before the break date. Palmer Payroll also needs 60 days' notice before renewal. The Barton and office notice deadlines are already on the calendar.",
  generated_by: "extractive",
  sources: [
    { contract_id: "demo-msa", contract_title: "Barton IT support agreement", location: "Section 3.2, page 5", excerpt: "The Term shall renew automatically unless either party gives not less than 60 days' written notice." },
    { contract_id: "demo-lease", contract_title: "28 Allen Avenue office lease", location: "Schedule 4, paragraph 2, page 31", excerpt: "The break notice must be received at the Landlord's registered office no later than six months before the Break Date." },
    { contract_id: "demo-software", contract_title: "Palmer Payroll annual subscription", location: "Order Form, Term", excerpt: "Either party may prevent renewal by providing written notice at least 60 days before the end of the current subscription term." },
  ],
};

export function demoComments(contractId: string): ContractComment[] {
  if (contractId !== "demo-msa") return [];
  return [{ id: "comment-msa", body: "I've sent Helen our cap wording. She needs finance to sign it off. Chidi, please chase her before we sign the renewal.", mentioned_user_ids: ["demo-chidi"], author_user_id: "demo-aisha", author_name: "Aisha Bello", author_email: "aisha@example.test", created_at: iso(-4), updated_at: iso(-4) }];
}

export function demoDecisions(contractId: string): ContractDecision[] {
  if (contractId === "demo-software") return [{ id: "decision-software", decision: "accept", subject: "Extra-employee rate agreed", rationale: "Palmer confirmed by email that extra employees will cost GBP 48 each for this subscription year. I've filed the email with the order form; this settles Pricing note 3 for the current term.", source_reference: { citation: "Order Form, Pricing note 3" }, reviewer_user_id: "demo-chidi", reviewer_name: "Chidi Okafor", reviewer_email: "chidi@example.test", created_at: iso(-7) }];
  if (contractId === "demo-msa") return [{ id: "decision-msa", decision: "change", subject: "Cap on data claims", rationale: "We can't sign while data claims sit outside the cap. I've asked Barton to bring Section 12.3 under Section 13.2.", source_reference: { citation: "Section 12.3, page 18" }, reviewer_user_id: "demo-aisha", reviewer_name: "Aisha Bello", reviewer_email: "aisha@example.test", created_at: iso(-5) }];
  return [];
}

export function demoNegotiationItems(contractId: string): NegotiationItem[] {
  if (contractId !== "demo-msa") return [];
  return [
    { id: "neg-msa-cap", contract_id: contractId, title: "Bring data claims under the liability cap", description: "Ask Barton to apply Section 13.2 to claims under Section 12.3.", category: "legal", priority: "high", status: "unresolved", our_position: "The agreed cap should cover data claims too, except for deliberate misconduct.", counterparty_position: "Barton wants to keep data claims outside the cap. Helen is checking with finance.", source_reference: { citation: "Section 12.3" }, created_by_user_id: "demo-aisha", created_by_name: "Aisha Bello", resolved_at: null, created_at: iso(-8), updated_at: iso(-2) },
    { id: "neg-msa-renewal", contract_id: contractId, title: "Agree 60 days' renewal notice", description: "120 days is too early for our budget cycle. Ask for 60 days instead.", category: "commercial", priority: "normal", status: "accepted", our_position: "60 days", counterparty_position: "Agreed. The revised draft now says 60 days.", source_reference: { citation: "Section 3.2" }, created_by_user_id: "demo-chidi", created_by_name: "Chidi Okafor", resolved_at: iso(-3), created_at: iso(-8), updated_at: iso(-3) },
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
    final_summary: items.length ? "Barton has agreed to 60 days for renewal notice. The cap on data claims is still open; Chidi needs to settle it before Aisha signs." : "No negotiation notes have been added for this agreement.",
  };
}

export function demoVersions(contractId: string): ContractVersion[] {
  if (contractId !== "demo-msa") return [];
  return [
    { id: "version-msa-2", contract_id: contractId, document_asset_id: "asset-msa-2", version_number: 2, label: "Revised draft from Barton", notes: "Helen sent the updated draft with 60 days' notice. The cap on data claims is still open.", source_name: "barton-it-support-revised.pdf", sha256: "3b284481d28c981aebacb501901a101e59397d2be073de7a4522a3845ac79900", size_bytes: 492000, comparison: { compared_to_version_id: "version-msa-1", added: ["60-day renewal notice"], removed: ["120-day renewal notice"], changed_summary: "Renewal notice changed from 120 to 60 days. Section 12.3 still leaves data claims outside the cap.", added_count: 1, removed_count: 1 }, uploaded_by_user_id: "demo-chidi", uploaded_by_name: "Chidi Okafor", created_at: iso(-3) },
    { id: "version-msa-1", contract_id: contractId, document_asset_id: "asset-msa-1", version_number: 1, label: "Initial draft", notes: "The first draft from Barton, before our comments.", source_name: "barton-it-support-draft.pdf", sha256: "16811d23a08c9b7192a50840318ce066411fabe7b041eea35bbfb4517b31f2f1", size_bytes: 478000, comparison: { compared_to_version_id: null, added: [], removed: [], changed_summary: "Initial version", added_count: 0, removed_count: 0 }, uploaded_by_user_id: "demo-aisha", uploaded_by_name: "Aisha Bello", created_at: iso(-18) },
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
    executive_summary: review?.analysis.executive_summary ?? "The review is not ready yet.",
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
    audit_event_count: 24,
    contract_types: [{ label: "Services", count: 2 }, { label: "Supply", count: 1 }, { label: "Lease", count: 1 }, { label: "Data processing", count: 1 }, { label: "Software", count: 1 }],
    active_task_priorities: [{ label: "high", count: 2 }, { label: "normal", count: 2 }],
    timeline: [
      { label: "Week 1", period_start: iso(-28), period_end: iso(-22), contracts_created: 1, tasks_created: 1, tasks_completed: 0, decisions_recorded: 0 },
      { label: "Week 2", period_start: iso(-21), period_end: iso(-15), contracts_created: 2, tasks_created: 1, tasks_completed: 0, decisions_recorded: 1 },
      { label: "Week 3", period_start: iso(-14), period_end: iso(-8), contracts_created: 2, tasks_created: 2, tasks_completed: 1, decisions_recorded: 1 },
      { label: "Week 4", period_start: iso(-7), period_end: iso(0), contracts_created: 1, tasks_created: 1, tasks_completed: 0, decisions_recorded: 2 },
    ],
    workload: demoMembers.map((member, index) => ({ user_id: member.user_id, display_name: member.display_name, email: member.email, role: member.role, active_tasks: [1, 1, 1, 1][index], overdue_tasks: index === 1 ? 1 : 0, completed_in_period: index === 1 ? 1 : 0 })),
    recent_activity: [
      { id: "report-review", action: "contract.review_ready", detail: { title: "Musa Packaging supply agreement" }, actor_user_id: null, actor_name: "LensLayer processing", contract_id: "demo-supplier", contract_title: "Musa Packaging supply agreement", created_at: iso(-1) },
      { id: "report-task", action: "task.updated", detail: { title: "Agree the cap on data claims with Barton" }, actor_user_id: "demo-chidi", actor_name: "Chidi Okafor", contract_id: "demo-msa", contract_title: "Barton IT support agreement", created_at: iso(-2) },
      { id: "report-decision", action: "contract.decision_recorded", detail: { title: "Palmer Payroll annual subscription" }, actor_user_id: "demo-chidi", actor_name: "Chidi Okafor", contract_id: "demo-software", contract_title: "Palmer Payroll annual subscription", created_at: iso(-6) },
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
  if (method !== "GET") return { handled: true, error: "This demo is read-only. Sign in to work with your own company's documents.", status: 403 };

  if (pathname === `${workspacePrefix}/settings`) return { handled: true, value: demoSettings };
  if (pathname === `${workspacePrefix}/contracts`) return { handled: true, value: demoContracts };
  if (pathname === `${workspacePrefix}/tasks`) return { handled: true, value: demoTasksFor(url.searchParams.get("contract_id")) };
  if (pathname === `${workspacePrefix}/lifecycle`) return { handled: true, value: demoLifecycleFor(url.searchParams.get("contract_id")) };
  if (pathname === `${workspacePrefix}/members`) return { handled: true, value: demoMembers };
  if (pathname === `${workspacePrefix}/invitations`) return { handled: true, value: [] };
  if (pathname === `${workspacePrefix}/notifications`) return { handled: true, value: demoNotifications };
  if (pathname === `${workspacePrefix}/reports/overview`) return { handled: true, value: demoReport((url.searchParams.get("range") ?? "30d") as ReportRange) };

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
    if (resource === "counterparty-responses") return { handled: true, value: contractId === "demo-msa" ? [{ id: "response-msa", contract_id: contractId, contract_version_id: "version-msa-2", recorded_by_user_id: "demo-chidi", recorded_by_name: "Chidi Okafor", responder_name: "Helen Price, Barton IT", channel: "email", body: "Hi Chidi, we've changed the renewal notice to 60 days in the attached draft. I'm still checking the data-claims cap with finance and will come back to you on that. Helen", related_item_ids: ["neg-msa-cap", "neg-msa-renewal"], created_at: iso(-3) }] : [] };
    if (resource === "negotiation-summary") return { handled: true, value: demoNegotiationSummary(contractId) };
    if (resource === "deal-passport") return { handled: true, value: demoDealPassport(contractId) };
    if (resource === "comments") return { handled: true, value: demoComments(contractId) };
    if (resource === "decisions") return { handled: true, value: demoDecisions(contractId) };
    if (resource === "approvals" || resource === "shares") return { handled: true, value: [] };
    if (resource === "activity") return { handled: true, value: demoActivity(contractId) };
  }

  const emptyCollections = ["/integrations", "/integrations/imports", "/integrations/providers", "/api-keys", "/webhooks", "/webhook-deliveries"];
  if (emptyCollections.some((suffix) => pathname.endsWith(suffix))) return { handled: true, value: [] };
  return { handled: true, error: "This record isn't in the demo workspace.", status: 404 };
}
