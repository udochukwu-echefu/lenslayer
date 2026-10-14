"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { exactDateTime } from "@/lib/agent-state";
import type { ContextEvidenceReceipt, EvidenceReceipt } from "@/lib/agent-types";
import { PageLoading } from "../page-states";
import { AgentViewError } from "./agent-view-state";

export function ActionEvidence({ organizationId, runId, evidenceId, isDemo, kind = "contract" }: { organizationId: string; runId: string; evidenceId: string; isDemo: boolean; kind?: "contract" | "context" }) {
  const [open, setOpen] = useState(false);
  return <details className="agent-evidence" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{isDemo ? "Inspect synthetic evidence" : "Inspect retained evidence receipt"}</summary>
    {open && <EvidenceSource key={`${organizationId}/${runId}/${evidenceId}/${kind}`} organizationId={organizationId} runId={runId} evidenceId={evidenceId} kind={kind} />}
    <p>{kind === "context" ? "Context source proof, not inferred truth or instructions. Offsets index original Python Unicode characters, not JavaScript UTF-16 positions. The full-source SHA-256 uses UTF-8. Older retained versions may be read, but writes require the latest version." : "Source-backed retrieval, not a legal conclusion. Offsets and the hash refer to extracted text, not PDF pages or file bytes."} Deleted or expired retained text makes receipts unavailable.</p>
  </details>;
}

function EvidenceSource({ organizationId, runId, evidenceId, kind }: { organizationId: string; runId: string; evidenceId: string; kind: "contract" | "context" }) {
  const query = useQuery<ContextEvidenceReceipt | EvidenceReceipt>({
    queryKey: ["agent-run", organizationId, runId, kind === "context" ? "context-evidence" : "evidence", evidenceId],
    queryFn: async ({ signal }) => {
      const data = kind === "context" ? await api.agentRunContextEvidence(organizationId, runId, evidenceId, signal) : await api.agentRunEvidence(organizationId, runId, evidenceId, signal);
      if (data.id !== evidenceId) throw new ApiError("Evidence did not match the requested receipt.", 502);
      return data;
    },
    retry: false, gcTime: 0, staleTime: 0,
  });
  return <>
    {query.isLoading && <PageLoading rows={2} />}
    {query.error && <AgentViewError error={query.error} resource="evidence" retry={() => void query.refetch()} />}
    {query.data && !query.error && <>
      {"context_id" in query.data && <p>Context source: <Link href={`/context/${encodeURIComponent(query.data.context_id)}`}>{query.data.context_id}</Link></p>}
      <dl className="agent-facts"><div><dt>Receipt</dt><dd><code>{query.data.id}</code></dd></div><div><dt>Retained version</dt><dd><code>{query.data.version_id}</code></dd></div><div><dt>Extracted-text offsets</dt><dd>{query.data.start_offset} to {query.data.end_offset}</dd></div><div><dt>Retrieved at</dt><dd><time dateTime={query.data.created_at}>{exactDateTime(query.data.created_at)}</time></dd></div><div className="agent-wide"><dt>Source SHA-256</dt><dd><code>{query.data.source_sha256}</code></dd></div></dl>
      <blockquote>{query.data.excerpt}</blockquote>
      <button type="button" className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Refresh evidence</button>
    </>}
  </>;
}
