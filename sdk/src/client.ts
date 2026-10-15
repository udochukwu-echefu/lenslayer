import { iterateEvents, type IterateEventsOptions } from "./events.js";
import { pollRun, type PollOptions } from "./polling.js";
import { AgentTransport, boundedInteger, type ClientOptions } from "./transport.js";
import type { ActionCreate, AgentAction, AgentRun, AgentTool, EvidenceReceipt, EvidenceRequest, EventOptions, InputRequest, InputRequestCreate, InputSupply, RequestOptions, RunCreate, RunEvent, WorkflowActionCreate, WorkflowCreate } from "./types.js";
import type { ContextSearch, ContextSearchHit, ContextEvidenceReceipt, WorkflowGraphCreate, WorkflowGraph, ToolName } from "./types.js";
import { LensLayerProtocolError } from "./errors.js";

const runPath = (id: string) => `/agent/runs/${encodeURIComponent(id)}`;

export class LensLayerClient {
  #transport: AgentTransport;
  constructor(options: ClientOptions) { this.#transport = new AgentTransport(options); }

  tools(options: RequestOptions = {}): Promise<AgentTool[]> {
    return this.#transport.request("/agent/tools", "GET", undefined, options.signal);
  }

  listRuns(options: RequestOptions & { limit?: number } = {}): Promise<AgentRun[]> {
    const limit = boundedInteger(options.limit ?? 50, "limit", 1, 100);
    return this.#transport.request(`/agent/runs?limit=${limit}`, "GET", undefined, options.signal);
  }

  createRun(input: RunCreate, options: RequestOptions = {}): Promise<AgentRun> {
    requireKey(input.idempotency_key);
    return this.#transport.request("/agent/runs", "POST", input, options.signal, true);
  }

  getRun(id: string, options: RequestOptions = {}): Promise<AgentRun> {
    return this.#transport.request(runPath(id), "GET", undefined, options.signal);
  }

  createWorkflow(input: WorkflowCreate, options: RequestOptions = {}): Promise<AgentRun> {
    requireKey(input.idempotency_key);
    return this.#transport.request("/agent/workflows", "POST", input, options.signal, true);
  }

  /** Atomically fixes every action/output ID. No later context-action proposal route exists. */
  async createWorkflowGraph(input: WorkflowGraphCreate, options: RequestOptions = {}): Promise<AgentRun> {
    validateGraph(input);
    const body = JSON.parse(JSON.stringify(input)) as WorkflowGraphCreate;
    await this.#requireV1(["context.retrieve", "workspace.context_tasks.create"], options);
    return this.#transport.request("/agent/workflow-graphs", "POST", body, options.signal, true);
  }

  async graph(id: string, options: RequestOptions = {}): Promise<WorkflowGraph> {
    await this.#requireV1(["context.retrieve", "workspace.context_tasks.create"], options);
    const data = await this.#transport.request<WorkflowGraph>(`${runPath(id)}/graph`, "GET", undefined, options.signal);
    validateGraphResponse(data, id);
    return data;
  }

  /** Scoped read-only planning search, without a run, receipt or write authority. */
  async searchContext(input: ContextSearch, options: RequestOptions = {}): Promise<ContextSearchHit[]> {
    validateSearch(input);
    const body = JSON.parse(JSON.stringify(input)) as ContextSearch;
    await this.#requireV1(["context.retrieve"], options);
    const data = await this.#transport.request<ContextSearchHit[]>("/agent/context-search", "POST", body, options.signal, true);
    validateContextResults(data, false, body.context_ids);
    return data;
  }

  async retrieveContextEvidence(id: string, input: ContextSearch, options: RequestOptions = {}): Promise<ContextEvidenceReceipt[]> {
    validateSearch(input);
    const body = JSON.parse(JSON.stringify(input)) as ContextSearch;
    await this.#requireV1(["context.retrieve"], options);
    // This consumes receipt budget and is deliberately NOT automatically retried.
    const data = await this.#transport.request<ContextEvidenceReceipt[]>(`${runPath(id)}/context-evidence`, "POST", body, options.signal);
    validateContextResults(data, true, body.context_ids);
    return data;
  }

  async readContextEvidence(id: string, evidenceId: string, options: RequestOptions = {}): Promise<ContextEvidenceReceipt> {
    await this.#requireV1(["context.retrieve"], options);
    const data = await this.#transport.request<ContextEvidenceReceipt>(`${runPath(id)}/context-evidence/${encodeURIComponent(evidenceId)}`, "GET", undefined, options.signal);
    validateContextResults([data], true);
    if (data.id !== evidenceId) throw new LensLayerProtocolError("Context evidence response does not match the requested receipt.");
    return data;
  }

  async #requireV1(names: ToolName[], options: RequestOptions) {
    const grants = await this.tools(options);
    if (!names.every((name) => grants.some((grant) => grant.name === name && grant.version === "1"))) throw new Error("Required version-1 context delegation is unavailable. Check scope, version, expiry and revocation.");
  }

  proposeToolAction(id: string, input: WorkflowActionCreate, options: RequestOptions = {}): Promise<AgentAction> {
    requireKey(input.idempotency_key);
    return this.#transport.request(`${runPath(id)}/tool-actions`, "POST", input, options.signal, true);
  }

  requestInput(id: string, input: InputRequestCreate, options: RequestOptions = {}): Promise<InputRequest> {
    requireKey(input.idempotency_key);
    return this.#transport.request(`${runPath(id)}/input-requests`, "POST", input, options.signal, true);
  }

  inputRequests(id: string, options: RequestOptions = {}): Promise<InputRequest[]> {
    return this.#transport.request(`${runPath(id)}/input-requests`, "GET", undefined, options.signal);
  }

  /** Only agent-responder requests. Human facts/approval remain human routes. */
  supplyInput(id: string, requestId: string, input: InputSupply, options: RequestOptions = {}): Promise<InputRequest> {
    return this.#transport.request(`${runPath(id)}/input-requests/${encodeURIComponent(requestId)}/supply`, "POST", input, options.signal, true);
  }

  events(id: string, options: EventOptions = {}): Promise<RunEvent[]> {
    const after = boundedInteger(options.afterSequence ?? 0, "afterSequence", 0, Number.MAX_SAFE_INTEGER);
    const limit = boundedInteger(options.limit ?? 100, "limit", 1, 200);
    return this.#transport.request(`${runPath(id)}/events?after_sequence=${after}&limit=${limit}`, "GET", undefined, options.signal);
  }

  iterateEvents(id: string, options: IterateEventsOptions = {}): AsyncGenerator<RunEvent> {
    return iterateEvents((page) => this.events(id, page), options);
  }

  actions(id: string, options: RequestOptions = {}): Promise<AgentAction[]> {
    return this.#transport.request(`${runPath(id)}/actions`, "GET", undefined, options.signal);
  }

  retrieveEvidence(id: string, input: EvidenceRequest, options: RequestOptions = {}): Promise<EvidenceReceipt> {
    return this.#transport.request(`${runPath(id)}/evidence`, "POST", input, options.signal);
  }

  readEvidence(id: string, evidenceId: string, options: RequestOptions = {}): Promise<EvidenceReceipt> {
    return this.#transport.request(`${runPath(id)}/evidence/${encodeURIComponent(evidenceId)}`, "GET", undefined, options.signal);
  }

  proposeAction(id: string, input: ActionCreate, options: RequestOptions = {}): Promise<AgentAction> {
    requireKey(input.idempotency_key);
    return this.#transport.request(`${runPath(id)}/actions`, "POST", input, options.signal, true);
  }

  cancelRun(id: string, options: RequestOptions = {}): Promise<AgentRun> {
    return this.#transport.request(`${runPath(id)}/cancel`, "POST", undefined, options.signal);
  }

  pollRun(id: string, options: PollOptions = {}): Promise<AgentRun> {
    return pollRun(id, (request) => this.getRun(id, request), options);
  }
}

function requireKey(key: string) {
  if (typeof key !== "string" || !key.trim() || key.length > 128) throw new Error("Supply a stable idempotency_key of 1 to 128 characters. Reuse the same key and input when retrying.");
}

// Dependency-free closed-shape guards for the new graph surface. Errors never echo input.
type Shape = Record<string, unknown>;
function shape(value: unknown, required: string[], optional: string[] = []): asserts value is Shape {
  if (!value || typeof value !== "object" || Array.isArray(value) || required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) invalid();
}
function invalid(): never { throw new Error("Invalid bounded context/graph input. Use the documented closed shape, explicit scope, boolean facts and timezone-aware dates."); }
function text(value: unknown, max: number) { if (typeof value !== "string" || !value.trim() || [...value.trim()].length > max) invalid(); }
function instant(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.test(value) || !Number.isFinite(Date.parse(value))) invalid();
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(calendar.valueOf()) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) invalid();
}
function ids(value: unknown, min = 1, max = 100): asserts value is string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid();
  value.forEach((entry) => text(entry, 64));
  if (new Set(value.map((entry) => entry.trim())).size !== value.length) invalid();
}
function query(value: unknown) {
  text(value, 200);
  const terms = new Set((value as string).toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
  if (!terms.size || terms.size > 10) invalid();
}
function validateSearch(input: unknown): asserts input is ContextSearch {
  shape(input, ["context_ids", "query"], ["max_results"]);
  ids(input.context_ids); query(input.query);
  if (input.max_results !== undefined) boundedInteger(input.max_results as number, "max_results", 1, 10);
}
function validateGraph(input: unknown): asserts input is WorkflowGraphCreate {
  shape(input, ["context_ids", "idempotency_key", "goal", "deadline_at", "nodes"]);
  ids(input.context_ids); text(input.idempotency_key, 128); text(input.goal, 4000); instant(input.deadline_at);
  if (!Array.isArray(input.nodes) || input.nodes.length < 1 || input.nodes.length > 20) invalid();
  const nodes = new Map<string, string[]>(), facts = new Map<string, boolean>();
  for (const node of input.nodes) {
    shape(node, ["id", "task"], ["depends_on", "not_before_at", "when"]); text(node.id, 64);
    const id = (node.id as string).trim();
    if (nodes.has(id)) invalid();
    const deps = node.depends_on === undefined ? [] : node.depends_on; ids(deps, 0, 19); nodes.set(id, deps.map((dep) => dep.trim()));
    if (node.not_before_at != null) { instant(node.not_before_at); if (Date.parse(node.not_before_at as string) >= Date.parse(input.deadline_at as string)) invalid(); }
    if (node.when != null) {
      shape(node.when, ["fact", "value", "equals"]);
      if (typeof node.when.fact !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(node.when.fact) || typeof node.when.value !== "boolean" || typeof node.when.equals !== "boolean") invalid();
      if (facts.has(node.when.fact) && facts.get(node.when.fact) !== node.when.value) invalid();
      facts.set(node.when.fact, node.when.value);
    }
    shape(node.task, ["context_id", "assigned_to_user_id", "title", "due_at", "query"], ["type", "description"]);
    if (node.task.type !== undefined && node.task.type !== "context_task_created") invalid();
    text(node.task.context_id, 64); text(node.task.assigned_to_user_id, 64); text(node.task.title, 512); instant(node.task.due_at); query(node.task.query);
    if (!input.context_ids.map((id) => id.trim()).includes((node.task.context_id as string).trim())) invalid();
    if (node.task.description !== undefined && (typeof node.task.description !== "string" || [...node.task.description].length > 4000)) invalid();
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  function visit(id: string) {
    if (!nodes.has(id) || visiting.has(id)) invalid();
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of nodes.get(id)!) { if (dep === id) invalid(); visit(dep); }
    visiting.delete(id); visited.add(id);
  }
  for (const id of nodes.keys()) visit(id);
}

function responseCheck(check: () => void) {
  try { check(); } catch { throw new LensLayerProtocolError("Unrecognized context/graph response. No receipt or readiness is assumed."); }
}
function validateContextResults(data: unknown, receipt: boolean, scope?: string[]): void {
  responseCheck(() => {
    if (!Array.isArray(data) || data.length > 10) invalid();
    for (const entry of data) {
      shape(entry, ["context_id", "version_id", "source_sha256", "start_offset", "end_offset", "excerpt", ...(receipt ? ["id", "created_at"] : [])]);
      text(entry.context_id, 64); text(entry.version_id, 64);
      if (scope && !scope.map((id) => id.trim()).includes(entry.context_id as string)) invalid();
      if (typeof entry.source_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.source_sha256) || !Number.isSafeInteger(entry.start_offset) || !Number.isSafeInteger(entry.end_offset) || (entry.start_offset as number) < 0 || (entry.end_offset as number) < (entry.start_offset as number) || typeof entry.excerpt !== "string" || [...entry.excerpt].length > 4000) invalid();
      if (receipt) { text(entry.id, 64); instant(entry.created_at); }
    }
  });
}
function validateGraphResponse(data: unknown, runId: string): void {
  responseCheck(() => {
    shape(data, ["run_id", "plan_sha256", "nodes"]);
    if (data.run_id !== runId || typeof data.plan_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.plan_sha256) || !Array.isArray(data.nodes) || !data.nodes.length || data.nodes.length > 20) invalid();
    const nodes = new Map<string, string[]>(), actions = new Set<string>();
    for (const node of data.nodes) {
      shape(node, ["id", "action_id", "depends_on", "not_before_at", "status"]);
      text(node.id, 64); text(node.action_id, 64); instant(node.not_before_at); ids(node.depends_on, 0, 19);
      if (!["blocked", "ready", "completed", "skipped"].includes(node.status as string) || nodes.has(node.id as string) || actions.has(node.action_id as string)) invalid();
      nodes.set(node.id as string, node.depends_on); actions.add(node.action_id as string);
    }
    const visiting = new Set<string>(), visited = new Set<string>();
    function visit(id: string) {
      if (!nodes.has(id) || visiting.has(id)) invalid();
      if (visited.has(id)) return;
      visiting.add(id); for (const dep of nodes.get(id)!) visit(dep); visiting.delete(id); visited.add(id);
    }
    for (const id of nodes.keys()) visit(id);
  });
}
