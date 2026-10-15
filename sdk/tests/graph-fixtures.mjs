export const contextGrants = ["context.retrieve", "workspace.context_tasks.create"].map((name) => ({ name, version: "1", description: name, requires_approval: true, input_schema: {} }));
export const graphInput = {
  idempotency_key: "northstar-onboarding-1", goal: "Create assigned follow-up tasks, not perform the follow-ups", context_ids: ["context-1"], deadline_at: "2099-10-15T12:00:00Z",
  nodes: [
    { id: "review", depends_on: [], not_before_at: "2099-10-14T14:00:00Z", when: { fact: "needs_follow_up", value: true, equals: true }, task: { context_id: "context-1", query: "customer onboarding", assigned_to_user_id: "member-1", title: "Review Northstar IT onboarding", description: "Check the assigned support owner.", due_at: "2099-10-16T12:00:00Z" } },
    { id: "handoff", depends_on: ["review"], when: { fact: "needs_follow_up", value: true, equals: false }, task: { context_id: "context-1", query: "support owner", assigned_to_user_id: "member-1", title: "Prepare the alternative support handoff", due_at: "2099-10-16T12:00:00Z" } },
  ],
};
export const graphReadback = { run_id: "graph-run", plan_sha256: "a".repeat(64), nodes: graphInput.nodes.map((node, i) => ({ id: node.id, action_id: `action-${i}`, depends_on: node.depends_on, not_before_at: node.not_before_at ?? "2099-10-14T12:00:00Z", status: i ? "blocked" : "ready" })) };
export const contextReceipt = { id: "context-evidence", context_id: "context-1", version_id: "context-version-1", source_sha256: "b".repeat(64), start_offset: 0, end_offset: 29, excerpt: "Synthetic customer onboarding", created_at: "2099-10-14T12:00:00Z" };
export const invalidGraphs = [
  (g) => ({ ...g, organization_id: "other" }),
  (g) => ({ ...g, token: "synthetic-forbidden-field" }),
  (g) => ({ ...g, context_ids: ["context-1", "context-1"] }),
  (g) => ({ ...g, nodes: [...g.nodes, g.nodes[0]] }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, depends_on: [n.id] })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, depends_on: ["unknown"] })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n, i) => ({ ...n, depends_on: [g.nodes[1 - i].id] })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, depends_on: null })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, when: { ...n.when, value: "true" } })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, when: { ...n.when, expression: "true" } })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n, i) => ({ ...n, when: { ...n.when, value: Boolean(i) } })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, not_before_at: g.deadline_at })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, task: { ...n.task, context_id: "outside-scope" } })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, task: { ...n.task, tool: "shell" } })) }),
  (g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, task: { ...n.task, due_at: "2099-02-30T12:00:00Z" } })) }),
];
