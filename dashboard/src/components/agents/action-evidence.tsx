"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { exactDateTime } from "@/lib/agent-state";
import { PageLoading } from "../page-states";
import { AgentViewError } from "./agent-view-state";

export function ActionEvidence({ organizationId, runId, evidenceId, isDemo }: { organizationId: string; runId: string; evidenceId: string; isDemo: boolean }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["agent-run", organizationId, runId, "evidence", evidenceId], queryFn: ({ signal }) => api.agentRunEvidence(organizationId, runId, evidenceId, signal), enabled: open, retry: false, gcTime: 0 });
  return <details className="agent-evidence" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{isDemo ? "Inspect synthetic evidence" : "Inspect retained evidence receipt"}</summary>
    {open && query.isLoading && <PageLoading rows={2} />}
    {open && query.error && <AgentViewError error={query.error} resource="evidence" retry={() => void query.refetch()} />}
    {open && query.data && !query.error && <>
      <dl className="agent-facts"><div><dt>Receipt</dt><dd><code>{query.data.id}</code></dd></div><div><dt>Retained version</dt><dd><code>{query.data.version_id}</code></dd></div><div><dt>Extracted-text offsets</dt><dd>{query.data.start_offset} to {query.data.end_offset}</dd></div><div><dt>Retrieved at</dt><dd><time dateTime={query.data.created_at}>{exactDateTime(query.data.created_at)}</time></dd></div><div className="agent-wide"><dt>Source SHA-256</dt><dd><code>{query.data.source_sha256}</code></dd></div></dl>
      <blockquote>{query.data.excerpt}</blockquote>
      <button type="button" className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh evidence</button>
    </>}
    <p>Source-backed retrieval, not a legal conclusion. Offsets and the hash refer to extracted text, not PDF pages or file bytes. Deleted, changed, or expired retained text may make this receipt unavailable.</p>
  </details>;
}
