"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Agent } from "@/lib/agent-types";
import { api } from "@/lib/api";

export function ContextScopeNarrowing({ agent }: { agent: Agent }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const mutation = useMutation({ mutationFn: (context_ids: string[]) => { pending.current = new AbortController(); return api.narrowAgentContext(agent.organization_id, agent.id, { context_ids }, pending.current.signal); }, retry: false, onSuccess: async () => { setOpen(false); await Promise.all([client.invalidateQueries({ queryKey: ["agents", agent.organization_id] }), client.invalidateQueries({ queryKey: ["agent-run", agent.organization_id] }), client.invalidateQueries({ queryKey: ["agent-runs", agent.organization_id] })]); } });
  const ids = agent.context_ids ?? [];
  if (!ids.length) return null;
  return <div className="agent-context-scope">{!open ? <button className="button secondary" type="button" onClick={() => setOpen(true)}>Narrow context access</button> : <form onSubmit={(event) => { event.preventDefault(); const selected = new FormData(event.currentTarget).getAll("context_ids").map(String); if (selected.every((id) => ids.includes(id))) mutation.mutate(selected); }}><fieldset className="agent-scope" disabled={mutation.isPending}><legend>Keep access only to selected context</legend><p>Removing a record immediately blocks its retrieval, approval and dispatch, including older runs. This cannot add scope or undo created tasks.</p>{ids.map((id) => <label key={id}><input type="checkbox" name="context_ids" value={id} defaultChecked /><span>{id}</span></label>)}<div className="agent-controls"><button className="button" type="submit">{mutation.isPending ? "Saving narrower scope…" : "Confirm narrower context scope"}</button><button className="button secondary" type="button" onClick={() => setOpen(false)}>Keep current scope</button></div></fieldset></form>}{mutation.error && <p className="form-error" role="alert">Scope was not confirmed. Refresh the delegation before trying again.</p>}</div>;
}
