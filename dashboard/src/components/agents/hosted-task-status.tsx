import Link from "next/link";
import type { HostedAgentTask } from "@/lib/hosted-agent-types";
import { exactDateTime, agentErrorNote } from "@/lib/agent-state";
import { goalLabels, plannerLabels, statusNotes } from "@/lib/hosted-agent-state";
import { StatusBadge } from "../ui/status-badge";

export function HostedTaskStatus({ task }: { task: HostedAgentTask }) {
  return <div className="hosted-status">
    <div className="agent-section-heading"><div><h3>{task.goal}</h3><p>{goalLabels[task.goal_type] ?? "Unrecognized bounded goal"}</p></div><StatusBadge status={task.status} /></div>
    <p>{statusNotes[task.status] ?? "Unrecognized task state. Inspect the run without assuming completion."}</p>
    <dl className="agent-facts"><div><dt>Planning method</dt><dd>{plannerLabels[task.planner_mode] ?? "Unknown planning method"}</dd></div><div><dt>Execution owner</dt><dd>LensLayer hosted agent <code>lenslayer_hosted_agent</code></dd></div><div><dt>Execution deadline</dt><dd><time dateTime={task.deadline_at}>{exactDateTime(task.deadline_at)}</time></dd></div><div><dt>Worker phase</dt><dd><code>{task.phase}</code></dd></div></dl>
    {task.error_code && <p className="agent-notice" role="alert"><strong>{task.error_code}</strong> {agentErrorNote(task.error_code)}</p>}
    {task.run_id ? <Link className="button secondary" href={`/runs/${encodeURIComponent(task.run_id)}`}>{task.status === "awaiting_approval" ? "Inspect and approve exact actions" : task.status === "awaiting_input" ? "Inspect factual input request" : "Inspect run and receipts"}</Link> : <p className="field-help">A run link will appear after the worker records the scoped run. No execution or approval is assumed yet.</p>}
  </div>;
}
