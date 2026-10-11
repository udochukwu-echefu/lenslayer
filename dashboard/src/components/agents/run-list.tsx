"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { exactDateTime, executionOwnerLabel, runPollInterval } from "@/lib/agent-state";
import type { AgentRun } from "@/lib/agent-types";
import { useWorkspace } from "../workspace-provider";
import { PageLoading } from "../page-states";
import { DataTable, type DataColumn } from "../ui/data-table";
import { StatusBadge } from "../ui/status-badge";
import { TableCard } from "../ui/table-card";
import { AgentDemoNotice, AgentViewError } from "./agent-view-state";
import "./agent-workspace.css";

export function RunList() {
  const { activeOrganization } = useWorkspace();
  if (!activeOrganization) return <div className="page"><PageLoading /></div>;
  return <WorkspaceRuns key={activeOrganization.id} organizationId={activeOrganization.id} />;
}

const columns: DataColumn<AgentRun>[] = [
  { id: "goal", header: "Goal", primary: true, cell: (run) => <><strong>{run.goal}</strong><small>{run.id}</small></> },
  { id: "status", header: "Status", cell: (run) => <StatusBadge status={run.status} />, sortValue: (run) => run.status },
  { id: "owner", header: "Planning owner", cell: (run) => executionOwnerLabel(run.execution_owner) },
  { id: "deadline", header: "Run deadline", cell: (run) => <time dateTime={run.deadline_at}>{exactDateTime(run.deadline_at)}</time>, sortValue: (run) => Date.parse(run.deadline_at) },
];

function WorkspaceRuns({ organizationId }: { organizationId: string }) {
  const { isDemo } = useWorkspace();
  const [limit, setLimit] = useState(50);
  const query = useQuery({ queryKey: ["agent-runs", organizationId, limit], queryFn: ({ signal }) => api.agentRuns(organizationId, limit, signal), retry: false, refetchInterval: (state) => !state.state.error && state.state.data?.some((run) => runPollInterval(run, isDemo)) ? 5000 : false });
  return <div className="page agent-page">
    <div className="page-heading"><div><h1 className="page-title">Runs</h1><p className="page-description">What hosted or external agents proposed, what people authorized, and what LensLayer verified.</p></div><div className="agent-controls"><Link className="button secondary" href="/agent-tasks">Agent tasks</Link><button type="button" className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh runs</button></div></div>
    {isDemo && <AgentDemoNotice />}
    {query.isLoading && <PageLoading />}
    {query.error && <AgentViewError error={query.error} retry={() => void query.refetch()} />}
    {query.data && !query.error && <TableCard title={isDemo ? "Synthetic run history" : "Recent runs"} description={`Latest ${limit} at most. Success certifies the specified object creation, not completion of the wider business process.`}><DataTable ariaLabel="Agent runs" columns={columns} rows={query.data} rowKey={(run) => run.id} rowHref={(run) => `/runs/${encodeURIComponent(run.id)}`} showFooter empty={<div className="inline-state"><div><h2>No runs in this workspace</h2><p>Assign an exact goal in Agent tasks, or create a run with your own server-side SDK/MCP client. Approval and verified receipts appear here once a scoped run is recorded.</p></div></div>} /></TableCard>}
    {!query.error && limit === 50 && query.data?.length === 50 && <button type="button" className="button secondary" onClick={() => setLimit(100)}>Show up to 100 recent runs</button>}
    <p className="agent-footnote">The recorded owner identifies hosted or developer-run planning. LensLayer owns scoped dispatch and read-back verification, not independent legal interpretation. Unknown outcomes may have remote effects.</p>
  </div>;
}
