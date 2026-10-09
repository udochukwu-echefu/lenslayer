"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { agentErrorNote, canAdministerAgents, exactDateTime, executionOwnerLabel, isTerminalRun, orderedEvents, runPollInterval } from "@/lib/agent-state";
import type { AgentRun } from "@/lib/agent-types";
import { useWorkspace } from "../workspace-provider";
import { PageLoading } from "../page-states";
import { StatusBadge } from "../ui/status-badge";
import { ActionReview } from "./action-review";
import { AgentDemoNotice, AgentViewError } from "./agent-view-state";
import { RunEvents } from "./run-events";
import { RunInputRequests } from "./run-input-requests";
import { SuccessConditionView } from "./success-condition";
import { knownCondition } from "@/lib/agent-shapes";
import { useBoundaryClock } from "./use-boundary-clock";
import "./agent-workspace.css";

export function RunDetail({ runId }: { runId: string }) {
  const { activeOrganization, activeRole, isDemo } = useWorkspace();
  if (!activeOrganization) return <div className="page"><PageLoading /></div>;
  return <WorkspaceRun key={`${activeOrganization.id}:${runId}:${activeRole}:${isDemo}`} organizationId={activeOrganization.id} runId={runId} />;
}

function WorkspaceRun({ organizationId, runId }: { organizationId: string; runId: string }) {
  const { isDemo } = useWorkspace();
  const client = useQueryClient();
  const key = ["agent-run", organizationId, runId];
  const run = useQuery({ queryKey: key, queryFn: ({ signal }) => api.agentRun(organizationId, runId, signal), retry: false, refetchInterval: (query) => query.state.error ? false : runPollInterval(query.state.data, isDemo) });
  const actions = useQuery({ queryKey: [...key, "actions"], queryFn: ({ signal }) => api.agentRunActions(organizationId, runId, signal), enabled: Boolean(run.data) && !run.error, retry: false, refetchInterval: (query) => query.state.error || run.error ? false : runPollInterval(run.data, isDemo) });
  const events = useInfiniteQuery({ queryKey: [...key, "events"], initialPageParam: 0, queryFn: ({ pageParam, signal }) => api.agentRunEvents(organizationId, runId, pageParam, 100, signal), enabled: Boolean(run.data) && !run.error, retry: false,
    getNextPageParam: (last, _pages, previous) => {
      if (last.length < 100) return undefined;
      const cursor = Math.max(...last.map((event) => event.sequence));
      return cursor > previous ? cursor : undefined;
    },
    refetchInterval: (query) => query.state.error || run.error ? false : runPollInterval(run.data, isDemo),
  });
  const status = run.data?.status;
  useEffect(() => {
    if (!status) return;
    // Fetch final receipts when run polling stops, not just the terminal status.
    void client.invalidateQueries({ queryKey: ["agent-run", organizationId, runId, "actions"] });
    void client.invalidateQueries({ queryKey: ["agent-run", organizationId, runId, "events"] });
    void client.invalidateQueries({ queryKey: ["agent-run", organizationId, runId, "inputs"] });
  }, [client, organizationId, runId, status]);
  const refresh = () => { void run.refetch(); void actions.refetch(); void events.refetch(); void client.invalidateQueries({ queryKey: [...key, "inputs"] }); };

  return <div className="page agent-page">
    <Link className="agent-back-link" href="/runs">Back to runs</Link>
    {isDemo && <AgentDemoNotice />}
    {run.isLoading && <PageLoading rows={7} />}
    {run.error && <AgentViewError error={run.error} resource="run" retry={() => void run.refetch()} />}
    {run.data && !run.error && <>
      <RunSummary organizationId={organizationId} run={run.data} refresh={refresh} refreshing={run.isFetching || actions.isFetching || events.isFetching} />
      <RunInputRequests organizationId={organizationId} run={run.data} />
      <section className="agent-action-section" aria-labelledby="actions-heading"><div className="section-heading"><h2 id="actions-heading">Action invocations</h2><p>Immutable proposals and persisted outcomes</p></div>
        {actions.isLoading && <PageLoading rows={3} />}
        {actions.error && <AgentViewError error={actions.error} resource="run" retry={() => void actions.refetch()} />}
        {!actions.error && actions.data?.map((action) => <ActionReview key={action.id} organizationId={organizationId} run={run.data!} action={action} events={events.error ? [] : orderedEvents(events.data?.pages ?? [])} />)}
        {actions.data?.length === 0 && <p className="agent-footnote">No action has been proposed. Planning and submission belong to the recorded execution owner; this view only inspects the ledger.</p>}
      </section>
      {events.isLoading && <PageLoading rows={3} />}
      {events.error && <AgentViewError error={events.error} resource="run" retry={() => void events.refetch()} />}
      {!events.error && <RunEvents events={orderedEvents(events.data?.pages ?? [])} hasMore={Boolean(events.hasNextPage)} loadingMore={events.isFetchingNextPage} loadMore={() => void events.fetchNextPage()} />}
    </>}
  </div>;
}

function RunSummary({ organizationId, run, refresh, refreshing }: { organizationId: string; run: AgentRun; refresh: () => void; refreshing: boolean }) {
  const { activeRole, isDemo } = useWorkspace();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const now = useBoundaryClock([run.deadline_at]);
  const mutation = useMutation({ mutationFn: () => api.cancelAgentRun(organizationId, run.id), retry: false, onSuccess: async () => {
    setConfirming(false);
    await client.invalidateQueries({ queryKey: ["agent-run", organizationId, run.id] });
    await client.invalidateQueries({ queryKey: ["agent-runs", organizationId] });
  } });
  const verified = run.status === "succeeded" && run.result.verified === true && knownCondition(run.success_condition);
  const kind = run.success_condition?.type;
  const hasCompletedConditions = Boolean(run.result.completed_conditions && typeof run.result.completed_conditions === "object" && Object.keys(run.result.completed_conditions).length > 0);
  return <>
    <div className="page-heading"><div><h1 className="page-title">Run detail</h1><p className="page-description">{run.goal}</p><code className="agent-record-id">{run.id}</code></div><div className="agent-controls"><StatusBadge status={run.status} /><button type="button" className="button secondary" disabled={refreshing} onClick={refresh}>Refresh record</button></div></div>
    <div className="agent-run-context">
      <section aria-labelledby="condition-heading"><h2 id="condition-heading">Exact success condition</h2><SuccessConditionView condition={run.success_condition} /></section>
      <section aria-labelledby="ownership-heading"><h2 id="ownership-heading">Execution ownership and limits</h2><dl className="agent-facts"><div><dt>Planning</dt><dd>{executionOwnerLabel(run.execution_owner)} <code>{run.execution_owner}</code><code>{run.agent_id}</code></dd></div><div><dt>Dispatch and verification</dt><dd>LensLayer worker</dd></div><div><dt>Run deadline</dt><dd><time dateTime={run.deadline_at}>{exactDateTime(run.deadline_at)}</time></dd></div><div><dt>Action budget</dt><dd>{run.max_actions}</dd></div><div className="agent-wide"><dt>Tools and resources</dt><dd>{run.allowed_tools.map((tool) => <code key={tool}>{tool}</code>)}{run.contract_ids.map((id) => <code key={id}>{id}</code>)}</dd></div></dl>{run.execution_owner === "lenslayer_hosted_agent" && <p>Hosted planning may be fixed workflow or optional model-assisted. <Link href="/agent-tasks">Inspect the assignment&apos;s planning method</Link>; this owner label alone does not imply a model was used.</p>}</section>
    </div>
    {run.calendar_targets?.length ? <section><h2>Delegated calendar targets</h2>{run.calendar_targets.map((target) => <p key={`${target.connection_id}:${target.calendar_id}`}><code>{target.connection_id}</code> · <code>{target.calendar_id}</code></p>)}</section> : null}
    {run.error_code && <p className="agent-notice" role="alert"><strong>{run.error_code}</strong> {agentErrorNote(run.error_code)}</p>}
    {!isTerminalRun(run.status) && Date.parse(run.deadline_at) <= now && <p className="agent-notice">The run deadline elapsed. Automatic refresh stopped. Refresh the record to inspect the server&apos;s final status; no outcome is assumed.</p>}
    <section className="agent-outcome" aria-labelledby="outcome-heading"><h2 id="outcome-heading">{isDemo ? "Synthetic outcome illustration" : verified ? kind === "workspace_task_created" ? "Verified outcome: follow-up task created" : kind === "calendar_event_created" ? "Verified outcome: calendar event created" : "Verified outcome: all named conditions completed" : "No verified outcome"}</h2><p>{verified ? kind === "workspace_task_created" ? "The worker created and read back the task. Renewal handling, notice delivery, and legal interpretation are not verified by this outcome." : "The recorded read-back receipts certify the exact objects at action completion, not continuing existence or performance of a business process." : "Queued work, human approval, input supply, or an agent's claim is not proof of completion. Inspect the server's recorded result and actions."}</p>{hasCompletedConditions && !verified && <p className="agent-notice">Some named conditions have completion receipts. The whole workflow is not verified; completed effects remain even if other conditions failed or were cancelled.</p>}{run.result.partial_effect === true && <p className="agent-notice" role="alert">Partial effect recorded. Cancellation did not undo the created object.</p>}{Object.keys(run.result).length > 0 && <details className="agent-json"><summary>{isDemo ? "Synthetic result data" : "Recorded verification result"}</summary><pre>{JSON.stringify(run.result, null, 2)}</pre></details>}{verified && !isDemo && kind === "workspace_task_created" && <Link className="button secondary" href="/tasks">Inspect workspace tasks</Link>}</section>
    {canAdministerAgents(activeRole, isDemo) && !isTerminalRun(run.status) && <div className="agent-cancel"><p>Cancellation prevents new dispatch. It does not undo a completed action or delete an already-created task. Inspect results for partial effects.</p><div className="agent-controls">{confirming ? <><button type="button" className="button danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Cancelling…" : "Confirm cancellation"}</button><button type="button" className="button secondary" disabled={mutation.isPending} onClick={() => setConfirming(false)}>Keep run</button></> : <button type="button" className="button secondary" onClick={() => setConfirming(true)}>Cancel run</button>}</div></div>}
    {mutation.error && <p className="form-error" role="alert">{mutation.error.message}</p>}
  </>;
}
