"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/workspace-query-hooks";

// Remount on workspace change so even the input and debounce cannot carry across tenants.
export function WorkspaceSearch({ organizationId }: { organizationId: string }) {
  return <ScopedSearch key={organizationId} organizationId={organizationId} />;
}

function ScopedSearch({ organizationId }: { organizationId: string }) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  const q = term.trim();
  const debounced = useDebouncedValue(q);
  const query = useQuery({ queryKey: ["workspace-search", organizationId, q], queryFn: ({ signal }) => api.searchWorkspace(organizationId, q, { signal }), enabled: Boolean(organizationId) && q.length >= 2 && debounced === q });
  const close = () => { setTerm(""); setOpen(false); if (open) trigger.current?.focus(); };
  const results = debounced === q ? query.data?.items ?? [] : [];
  return <><div className={`global-search ${open ? "mobile-search-open" : ""}`} onKeyDown={(event) => { if (event.key === "Escape") close(); }}><label><Search size={16} /><span className="sr-only">Global search</span><input ref={input} value={term} maxLength={200} onChange={(event) => setTerm(event.target.value)} placeholder="Search contracts, tasks, parties, or dates" aria-controls={q.length >= 2 ? "workspace-search-results" : undefined} /></label>{open && <button className="icon-button mobile-search-close" type="button" aria-label="Close global search" onClick={close}><X size={18} /></button>}{q.length >= 2 && <div className="global-results" id="workspace-search-results" aria-label="Workspace search results">{q !== debounced || query.isFetching ? <p role="status">Searching…</p> : query.error ? <p role="alert">Search could not load. <button type="button" onClick={() => void query.refetch()}>Try again</button></p> : results.length ? results.map((result) => <Link href={result.href} key={`${result.kind}-${result.id}`} onClick={close}><strong>{result.title}</strong><span>{result.meta}</span></Link>) : <p role="status">No workspace records match this search.</p>}</div>}</div><button ref={trigger} className="icon-button mobile-search-trigger" type="button" aria-label="Search workspace" onClick={() => setOpen(true)}><Search size={18} /></button></>;
}
