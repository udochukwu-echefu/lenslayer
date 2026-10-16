"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Agent } from "@/lib/agent-types";
import { canAdministerAgents, exactDateTime } from "@/lib/agent-state";
import { useWorkspace } from "../workspace-provider";
import { PageLoading } from "../page-states";
import { StatusBadge } from "../ui/status-badge";
import { AgentCreateForm } from "./agent-create-form";
import { AgentDemoNotice, AgentViewError } from "./agent-view-state";
import { useBoundaryClock } from "./use-boundary-clock";
import { ContextScopeNarrowing } from "./context-scope";
import { AgentsHubHeader } from "./agents-hub-header";
import "./agent-workspace.css";

export function AgentRegistry() {
  const { activeOrganization, activeRole, isDemo } = useWorkspace();
  if (!activeOrganization) return <div className="page"><PageLoading /></div>;
  return <WorkspaceAgents key={`${activeOrganization.id}:${activeRole}:${isDemo}`} organizationId={activeOrganization.id} />;
}

function WorkspaceAgents({ organizationId }: { organizationId: string }) {
  const { activeRole, isDemo } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const canManage = canAdministerAgents(activeRole, isDemo);
  const canInspect = isDemo || canManage;
  const query = useQuery({ queryKey: ["agents", organizationId], queryFn: ({ signal }) => api.agents(organizationId, signal), enabled: canInspect, retry: false });
  return <div className="page agent-page agent-hub-page">
    <AgentsHubHeader section="credentials" actions={<><Link className="button secondary" href="/agent-tasks">Assign a hosted goal</Link>{canManage && !creating && !query.error && <button className="button" type="button" onClick={() => setCreating(true)}>Create agent</button>}</>} />
    {isDemo && <AgentDemoNotice />}
    {!isDemo && !canManage && <div className="inline-state"><div><h2>Administrator access required</h2><p>Only owners and administrators can inspect or change agent delegations. You can still open the runs your workspace permissions allow.</p><Link className="button secondary" href="/agents/runs">View runs</Link></div></div>}
    {creating && canManage && !query.error && <AgentCreateForm organizationId={organizationId} close={() => setCreating(false)} />}
    {canInspect && query.isLoading && <PageLoading rows={3} />}
    {canInspect && query.error && <AgentViewError error={query.error} retry={() => void query.refetch()} />}
    {canInspect && query.data && !query.error && <section aria-labelledby="delegations-heading"><div className="section-heading"><h2 id="delegations-heading">{isDemo ? "Synthetic credential" : "Workspace credentials"}</h2><p>{query.data.length} {query.data.length === 1 ? "credential" : "credentials"}</p></div>{query.data.length ? <div className="agent-register agent-credentials-list">{query.data.map((agent) => <AgentRecord key={agent.id} agent={agent} canManage={canManage} />)}</div> : <div className="inline-state"><div><h2>No delegated agents</h2><p>Create a scoped credential for a developer-run agent after retaining a contract and choosing a workspace assignee.</p></div></div>}</section>}
    <p className="agent-footnote">Revocation blocks new work. It does not delete tasks already created or undo completed actions. <Link href="/settings/developers">Developer setup guide</Link></p>
  </div>;
}

function AgentRecord({ agent, canManage }: { agent: Agent; canManage: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const now = useBoundaryClock([agent.expires_at]);
  const status = agent.status === "active" && Date.parse(agent.expires_at) <= now ? "expired" : agent.status;
  const scope = [
    `${agent.allowed_tools.length} ${agent.allowed_tools.length === 1 ? "tool" : "tools"}`,
    agent.contract_ids.length ? `${agent.contract_ids.length} ${agent.contract_ids.length === 1 ? "contract" : "contracts"}` : null,
    agent.context_ids?.length ? `${agent.context_ids.length} ${agent.context_ids.length === 1 ? "context record" : "context records"}` : null,
    agent.assignee_ids.length ? `${agent.assignee_ids.length} ${agent.assignee_ids.length === 1 ? "assignee" : "assignees"}` : null,
    agent.calendar_targets?.length ? `${agent.calendar_targets.length} ${agent.calendar_targets.length === 1 ? "calendar target" : "calendar targets"}` : null,
  ].filter(Boolean).join(" · ");
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: () => api.revokeAgent(agent.organization_id, agent.id), retry: false, onSuccess: async () => {
    setConfirming(false);
    await Promise.all([client.invalidateQueries({ queryKey: ["agents", agent.organization_id] }), client.invalidateQueries({ queryKey: ["agent-runs", agent.organization_id] })]);
  } });
  return <article className="agent-record agent-credential-record" aria-label={`${agent.name} credential`}>
    <header className="agent-credential-overview">
      <div className="agent-credential-name"><h3 title={agent.name}>{agent.name}</h3><code className="agent-credential-id" title={agent.id}>{agent.id}</code><p className="agent-credential-summary">{scope}</p><p className="agent-credential-policy">{agent.require_approval ? "Human approval required" : "Approval not required"} · {agent.max_actions_per_run} {agent.max_actions_per_run === 1 ? "action" : "actions"} per run</p></div>
      <div className="agent-credential-state"><span className="agent-overview-label">Status</span><StatusBadge status={status} /></div>
      <div className="agent-credential-expiry"><span className="agent-overview-label">Expires</span><time dateTime={agent.expires_at}>{exactDateTime(agent.expires_at)}</time></div>
      {canManage && agent.status !== "revoked" && <button className="button secondary" type="button" aria-label={`Revoke ${agent.name}`} disabled={confirming || mutation.isPending} onClick={() => setConfirming(true)}>Revoke</button>}
    </header>
    {canManage && agent.status !== "revoked" && confirming && <div className="agent-controls agent-revoke-confirmation"><p>Revoke access and cancel unfinished runs? Already-created tasks remain.</p><button className="button danger" type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Revoking…" : "Confirm revocation"}</button><button className="button secondary" type="button" disabled={mutation.isPending} onClick={() => setConfirming(false)}>Keep access</button></div>}
    <details className="agent-exact-scope">
      <summary aria-label={`Exact scope for ${agent.name}`}>View exact scope</summary>
      <dl className="agent-facts"><div><dt>Tools</dt><dd>{agent.allowed_tools.map((tool) => <code key={tool}>{tool}</code>)}</dd></div><div><dt>Contracts</dt><dd>{agent.contract_ids.length ? agent.contract_ids.map((id) => <Link href={`/contracts/${encodeURIComponent(id)}`} key={id}>{id}</Link>) : "None delegated"}</dd></div><div><dt>Permitted assignees</dt><dd>{agent.assignee_ids.length ? agent.assignee_ids.map((id) => <code key={id}>{id}</code>) : "None delegated"}</dd></div><div><dt>Calendar targets</dt><dd>{agent.calendar_targets?.length ? agent.calendar_targets.map((target) => <span key={`${target.connection_id}:${target.calendar_id}`}><code>{target.connection_id}</code><code>{target.calendar_id}</code></span>) : "None delegated"}</dd></div><div><dt>Approval policy</dt><dd>{agent.require_approval ? "Human approval for every action" : "No human approval required"}</dd></div><div><dt>Action limit</dt><dd>{agent.max_actions_per_run} per run</dd></div><div><dt>Delegated by</dt><dd><code>{agent.delegated_by_user_id}</code></dd></div><div><dt>Workspace context</dt><dd>{agent.context_ids?.length ? agent.context_ids.map((id) => <Link href={`/context/${encodeURIComponent(id)}`} key={id}>{id}</Link>) : "None delegated"}</dd></div></dl>
      {canManage && status === "active" && Date.parse(agent.expires_at) > now && <ContextScopeNarrowing key={(agent.context_ids ?? []).join(":")} agent={agent} />}
    </details>
    {mutation.error && <p className="form-error" role="alert">{mutation.error.message}</p>}
  </article>;
}
