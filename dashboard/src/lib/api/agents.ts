import type { Agent, AgentAction, AgentCreate, AgentCreated, AgentRun, ApprovalDecision, EvidenceReceipt, InputRequest, InputSupply, RunEvent } from "../agent-types";
import { isDemoWorkspace } from "../workspace-mode";
import { ApiError, jsonRequest, request } from "./client";

const organizationPath = (id: string) => `/organizations/${encodeURIComponent(id)}`;
const runPath = (org: string, run: string) => `${organizationPath(org)}/agent-runs/${encodeURIComponent(run)}`;

async function demoOrRequest<T>(org: string, path: string, signal?: AbortSignal): Promise<T> {
  if (isDemoWorkspace(org)) {
    const { demoAgentResponse } = await import("../agent-demo-data");
    return demoAgentResponse(path) as T;
  }
  // Public preview settings must never intercept a signed-in workspace request.
  return request<T>(path, { signal }, false);
}

function requirePrivateWorkspace(org: string) {
  if (isDemoWorkspace(org)) throw new ApiError("Synthetic demo records are read-only. No agent or task will execute here.", 403);
}

export const agentsApi = {
  agents: (org: string, signal?: AbortSignal) => demoOrRequest<Agent[]>(org, `${organizationPath(org)}/agents`, signal),
  createAgent: (org: string, input: AgentCreate, signal?: AbortSignal) => {
    requirePrivateWorkspace(org);
    return jsonRequest<AgentCreated>(`${organizationPath(org)}/agents`, "POST", input, false, signal);
  },
  revokeAgent: (org: string, agent: string) => {
    requirePrivateWorkspace(org);
    return request<Agent>(`${organizationPath(org)}/agents/${encodeURIComponent(agent)}/revoke`, { method: "POST" }, false);
  },
  agentRuns: (org: string, limit = 50, signal?: AbortSignal) => demoOrRequest<AgentRun[]>(org, `${organizationPath(org)}/agent-runs?limit=${limit}`, signal),
  agentRun: (org: string, run: string, signal?: AbortSignal) => demoOrRequest<AgentRun>(org, runPath(org, run), signal),
  agentRunEvents: (org: string, run: string, afterSequence = 0, limit = 100, signal?: AbortSignal) => demoOrRequest<RunEvent[]>(org, `${runPath(org, run)}/events?after_sequence=${afterSequence}&limit=${limit}`, signal),
  agentRunActions: (org: string, run: string, signal?: AbortSignal) => demoOrRequest<AgentAction[]>(org, `${runPath(org, run)}/actions`, signal),
  agentRunEvidence: (org: string, run: string, evidence: string, signal?: AbortSignal) => demoOrRequest<EvidenceReceipt>(org, `${runPath(org, run)}/evidence/${encodeURIComponent(evidence)}`, signal),
  agentInputRequests: (org: string, run: string, signal?: AbortSignal) => demoOrRequest<InputRequest[]>(org, `${runPath(org, run)}/input-requests`, signal),
  supplyAgentRunInput: (org: string, run: string, inputId: string, input: InputSupply) => {
    requirePrivateWorkspace(org);
    return jsonRequest<InputRequest>(`${runPath(org, run)}/input-requests/${encodeURIComponent(inputId)}/supply`, "POST", input, false);
  },
  reconcileAgentAction: (org: string, run: string, action: string) => {
    requirePrivateWorkspace(org);
    return request<AgentAction>(`${runPath(org, run)}/actions/${encodeURIComponent(action)}/reconcile`, { method: "POST" }, false);
  },
  cancelAgentRun: (org: string, run: string) => {
    requirePrivateWorkspace(org);
    return request<AgentRun>(`${runPath(org, run)}/cancel`, { method: "POST" }, false);
  },
  decideAgentAction: (org: string, run: string, action: string, input: ApprovalDecision) => {
    requirePrivateWorkspace(org);
    return jsonRequest<AgentAction>(`${runPath(org, run)}/actions/${encodeURIComponent(action)}/approval`, "POST", input, false);
  },
};
