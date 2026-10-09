"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { AgentRun, InputRequest, InputSupply } from "@/lib/agent-types";
import { canAdministerAgents, exactDateTime, runPollInterval } from "@/lib/agent-state";
import { useWorkspace } from "../workspace-provider";
import { AgentViewError } from "./agent-view-state";
import { StatusBadge } from "../ui/status-badge";
import { useBoundaryClock } from "./use-boundary-clock";

export function RunInputRequests({ organizationId, run }: { organizationId: string; run: AgentRun }) {
  const { isDemo } = useWorkspace();
  const query = useQuery({ queryKey: ["agent-run", organizationId, run.id, "inputs"], queryFn: ({ signal }) => api.agentInputRequests(organizationId, run.id, signal), retry: false, refetchInterval: (query) => query.state.error || run.status !== "awaiting_input" ? false : runPollInterval(run, isDemo) });
  if (run.status !== "awaiting_input" && query.isSuccess && !query.data.length) return null;
  return <section className="agent-action-section" aria-labelledby="input-requests-heading"><h2 id="input-requests-heading">Typed factual input</h2><p>{run.status === "awaiting_input" && "The run is waiting, not terminal. "}Supplying facts does not change scope, success conditions, deadlines or immutable actions, and is not approval.</p>{query.isLoading && <p role="status">Loading input requests…</p>}{query.error && <AgentViewError error={query.error} retry={() => void query.refetch()} />}{!query.error && query.data?.map((request) => <InputRequestForm key={request.id} organizationId={organizationId} run={run} request={request} />)}</section>;
}

function InputRequestForm({ organizationId, run, request }: { organizationId: string; run: AgentRun; request: InputRequest }) {
  const { activeRole, isDemo } = useWorkspace();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const now = useBoundaryClock([request.request.expires_at, run.deadline_at]);
  const fields = request.request.fields;
  const safeFields = fields.length > 0 && fields.length <= 20 && fields.every((field) => /^[a-z][a-z0-9_]{0,63}$/.test(field.name) && !/token|secret|password|credential/.test(field.name) && ["text", "date_time", "integer", "boolean"].includes(field.type));
  const canSupply = safeFields && canAdministerAgents(activeRole, isDemo) && request.status === "pending" && request.request.responder !== "agent" && run.status === "awaiting_input" && Date.parse(request.request.expires_at) > now && Date.parse(run.deadline_at) > now;
  const mutation = useMutation({ mutationFn: (input: InputSupply) => api.supplyAgentRunInput(organizationId, run.id, request.id, input), retry: false, onSuccess: () => client.invalidateQueries({ queryKey: ["agent-run", organizationId, run.id] }) });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canSupply) return;
    const form = new FormData(event.currentTarget), values: InputSupply["values"] = {};
    for (const field of fields) {
      const raw = String(form.get(field.name) ?? "");
      if (field.type === "integer") {
        if (!/^-?\d+$/.test(raw) || Number(raw) < -2147483648 || Number(raw) > 2147483647) { setError("Supply a signed 32-bit integer for each integer field."); return; }
        values[field.name] = Number(raw);
      } else if (field.type === "boolean") values[field.name] = raw === "true";
      else if (field.type === "date_time") {
        if (!Number.isFinite(Date.parse(raw))) { setError("Supply a valid local date and time; it will be converted to UTC."); return; }
        values[field.name] = new Date(raw).toISOString();
      } else values[field.name] = raw;
    }
    setError(""); mutation.mutate({ values });
  }
  return <article className="agent-action panel"><h3>{request.request.reason}</h3><StatusBadge status={request.status} /><p>Requested responder: {request.request.responder ?? "human"}. Expires {exactDateTime(request.request.expires_at)}.</p>{!safeFields && <p role="alert">Unsupported or credential-like input fields. Supply is disabled; never enter secrets here.</p>}{canSupply ? <form onSubmit={submit}><fieldset disabled={mutation.isPending}>{fields.map((field) => <div className="field" key={field.name}><label htmlFor={`${request.id}-${field.name}`}>{field.prompt}</label>{field.type === "boolean" ? <select className="input" id={`${request.id}-${field.name}`} name={field.name} required defaultValue=""><option value="" disabled>Select a value</option><option value="true">True</option><option value="false">False</option></select> : <input className="input" id={`${request.id}-${field.name}`} name={field.name} required maxLength={4000} type={field.type === "date_time" ? "datetime-local" : field.type === "integer" ? "number" : "text"} step={field.type === "integer" ? 1 : undefined} />}</div>)}<button className="button" type="submit">{mutation.isPending ? "Recording facts…" : "Supply exact facts"}</button></fieldset></form> : request.status === "pending" && <p>Waiting for the authorized {request.request.responder === "agent" ? "external agent" : "workspace owner or administrator"}. Expired requests cannot be supplied.</p>}{(error || mutation.error) && <p className="form-error" role="alert">{error || mutation.error?.message}</p>}{request.status === "supplied" && <details className="agent-json"><summary>Immutable supplied facts</summary><pre>{JSON.stringify(request.values, null, 2)}</pre><p>Supplied by {request.supplied_by_user_id ?? request.supplied_by_agent_id ?? "recorded responder"}.</p></details>}</article>;
}
