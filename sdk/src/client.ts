import { iterateEvents, type IterateEventsOptions } from "./events.js";
import { pollRun, type PollOptions } from "./polling.js";
import { AgentTransport, boundedInteger, type ClientOptions } from "./transport.js";
import type { ActionCreate, AgentAction, AgentRun, AgentTool, EvidenceReceipt, EvidenceRequest, EventOptions, InputRequest, InputRequestCreate, InputSupply, RequestOptions, RunCreate, RunEvent, WorkflowActionCreate, WorkflowCreate } from "./types.js";

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
