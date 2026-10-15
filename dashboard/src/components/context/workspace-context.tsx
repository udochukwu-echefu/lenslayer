"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { ContextRecord, ContextRecordCreate } from "@/lib/agent-types";
import { canAdministerAgents, exactDateTime } from "@/lib/agent-state";
import { useWorkspace } from "../workspace-provider";
import { PageLoading } from "../page-states";
import { NativeSelect } from "../native-select";
import { useBoundaryClock } from "../agents/use-boundary-clock";
import "../agents/agent-workspace.css";
import "./workspace-context.css";

export function ContextError({ error, retry }: { error: Error; retry: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  return <div className="inline-state" role="alert"><div><h2>{status === 401 || status === 403 ? "Access restricted" : status === 409 ? "Version conflict" : status === 404 || status === 410 ? "Context unavailable" : "Context could not load"}</h2><p>{status === 409 ? "Another version was saved. Refresh the record and review the current source before saving again." : status === 404 || status === 410 ? "This context or version may be deleted, expired, or outside your workspace access. No source is shown." : status === 401 || status === 403 ? "Workspace membership is required to read context. Only owners and administrators can change it." : "The request did not finish. Refresh to check the authoritative record before retrying a write."}</p><button className="button secondary" type="button" onClick={retry}>Refresh record</button></div></div>;
}

export function WorkspaceContextPage({ recordId }: { recordId?: string }) {
  const { activeOrganization, activeRole, isDemo, error } = useWorkspace();
  if (error) return <div className="page"><p role="alert">Workspace access could not be loaded. Sign in again before reading private context.</p></div>;
  if (!activeOrganization) return <div className="page"><PageLoading /></div>;
  if (!isDemo && !activeRole) return <div className="page"><p role="alert">Workspace membership is required to read context.</p></div>;
  return <ContextWorkspace key={`${activeOrganization.id}:${activeRole}:${isDemo}:${recordId ?? "list"}`} organizationId={activeOrganization.id} recordId={recordId} />;
}

function ContextWorkspace({ organizationId, recordId }: { organizationId: string; recordId?: string }) {
  const { activeRole, isDemo } = useWorkspace();
  const canWrite = canAdministerAgents(activeRole, isDemo);
  const [creating, setCreating] = useState(false);
  const records = useQuery({ queryKey: ["context-records", organizationId], queryFn: ({ signal }) => api.contextRecords(organizationId, signal), enabled: !recordId, retry: false });
  return <div className="page agent-page context-page">
    <div className="page-heading"><div><h1 className="page-title">Workspace context</h1><p className="page-description">Private briefs and working notes for source-backed follow-up tasks.</p></div>{!recordId && canWrite && !records.error && !creating && <button className="button" type="button" onClick={() => setCreating(true)}>Add context</button>}</div>
    {isDemo ? <p className="agent-notice">Synthetic preview. These fictional notes are read-only and separate from private workspaces.</p> : <p className="context-intro">Members can read retained versions. Owners and administrators can add or erase context. Retention cannot be extended; deleting a record erases every retained version.</p>}
    {recordId ? <ContextDetail organizationId={organizationId} recordId={recordId} canWrite={canWrite} /> : <>
      {records.isLoading && <PageLoading rows={4} />}
      {records.error && <ContextError error={records.error} retry={() => void records.refetch()} />}
      {!records.error && creating && canWrite && <ContextCreate organizationId={organizationId} close={() => setCreating(false)} />}
      {!records.error && records.data && <section aria-label="Context records">{records.data.length ? <ul className="context-register">{records.data.map((record) => <ContextRow key={record.id} record={record} />)}</ul> : <div className="inline-state"><div><h2>No workspace context yet</h2><p>{canWrite ? "Add an onboarding brief, support handoff, or project note with an explicit retention period." : "An owner or administrator can add a brief for your team. No context has been retained here."}</p></div></div>}</section>}
      {!canWrite && !isDemo && <p className="field-help">Your role can read context. Ask an owner or administrator to add, version, or delete it.</p>}
    </>}
  </div>;
}

function ContextRow({ record }: { record: ContextRecord }) {
  const now = useBoundaryClock([record.expires_at]);
  const state = record.deleted_at ? "Deleted" : Date.parse(record.expires_at) <= now ? "Expired" : "Retained";
  return <li><div><Link href={`/context/${encodeURIComponent(record.id)}`}>{record.title}</Link><p>Version {record.current_version} · {state}</p></div><p>Expires <time dateTime={record.expires_at}>{exactDateTime(record.expires_at)}</time></p></li>;
}

function ContextCreate({ organizationId, close }: { organizationId: string; close: () => void }) {
  const client = useQueryClient();
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const mutation = useMutation({ mutationFn: (input: ContextRecordCreate) => { pending.current = new AbortController(); return api.createContextRecord(organizationId, input, pending.current.signal); }, retry: false, gcTime: 0, onSuccess: async () => { await client.invalidateQueries({ queryKey: ["context-records", organizationId] }); close(); } });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const days = Number(form.get("retention_days"));
    if (![7, 30, 90, 365].includes(days)) return;
    mutation.mutate({ title: String(form.get("title")).trim(), text: String(form.get("text")).trim(), expires_at: new Date(Date.now() + days * 86400000).toISOString() });
  }
  return <section className="context-editor" aria-labelledby="new-context-heading"><h2 id="new-context-heading">Add a private brief</h2><form onSubmit={submit}><fieldset disabled={mutation.isPending || Boolean(mutation.error)} className="agent-form-fields"><div className="field"><label htmlFor="context-title">Title</label><input className="input" id="context-title" name="title" required maxLength={255} placeholder="Relay Software support handoff" /></div><div className="field"><label htmlFor="context-text">Source text</label><textarea className="textarea" id="context-text" name="text" required maxLength={100000} rows={8} aria-describedby="context-source-help" /><p className="field-help" id="context-source-help">Private workspace source, not instructions or approval. Do not include credentials. Maximum 100,000 characters. Leading and trailing whitespace is trimmed before storage.</p></div><div className="field"><label htmlFor="context-retention">Retention from creation</label><NativeSelect id="context-retention" name="retention_days" defaultValue="30"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></NativeSelect><p className="field-help">Applies to every version and cannot be extended. Expired text becomes unavailable and is erased by retention sweeps.</p></div><div className="agent-controls"><button className="button" type="submit">{mutation.isPending ? "Saving context…" : "Save context"}</button><button className="button secondary" type="button" onClick={close}>Cancel</button></div></fieldset>{mutation.error && <ContextError error={mutation.error} retry={() => { void client.invalidateQueries({ queryKey: ["context-records", organizationId] }); close(); }} />}</form></section>;
}

function ContextDetail({ organizationId, recordId, canWrite }: { organizationId: string; recordId: string; canWrite: boolean }) {
  const client = useQueryClient();
  const key = ["context-record", organizationId, recordId];
  const record = useQuery({ queryKey: key, queryFn: ({ signal }) => api.contextRecord(organizationId, recordId, signal), retry: false });
  const now = useBoundaryClock([record.data?.expires_at ?? null]);
  const [selectedVersion, setVersion] = useState<number | null>(null);
  const [reading, setReading] = useState(false), [editing, setEditing] = useState(false), [deleting, setDeleting] = useState(false), [confirmation, setConfirmation] = useState("");
  const retained = Boolean(record.data && !record.error && !record.data.deleted_at && Date.parse(record.data.expires_at) > now);
  const versionNumber = selectedVersion ?? record.data?.current_version ?? 1;
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const version = useMutation({ mutationFn: ({ text, expected_version }: { text: string; expected_version: number }) => { pending.current = new AbortController(); return api.createContextVersion(organizationId, recordId, { text, expected_version }, pending.current.signal); }, retry: false, gcTime: 0, onSuccess: async () => { setEditing(false); setReading(false); setVersion(null); version.reset(); await client.invalidateQueries({ queryKey: key }); await client.invalidateQueries({ queryKey: ["context-records", organizationId] }); } });
  const deletion = useMutation({ mutationFn: () => { pending.current = new AbortController(); return api.deleteContextRecord(organizationId, recordId, pending.current.signal); }, retry: false, onSuccess: async () => { setReading(false); setEditing(false); setDeleting(false); client.removeQueries({ queryKey: [...key, "version"] }); await client.invalidateQueries({ queryKey: key }); await client.invalidateQueries({ queryKey: ["context-records", organizationId] }); } });
  const refresh = () => { setReading(false); setEditing(false); version.reset(); void record.refetch(); };
  const busy = version.isPending || deletion.isPending;
  return <><Link className="agent-back-link" href="/context">Back to workspace context</Link>{record.isLoading && <PageLoading rows={5} />}{record.error && <ContextError error={record.error} retry={refresh} />}{deletion.isSuccess && <p role="status">Context deleted. All retained version text was erased. Existing source hashes and receipts may remain, but source reads are blocked.</p>}{record.data && !record.error && <section className="context-detail" aria-label="Context detail"><h2>{record.data.title}</h2><dl className="agent-facts"><div><dt>Current version</dt><dd>{record.data.current_version}</dd></div><div><dt>Retention expires</dt><dd><time dateTime={record.data.expires_at}>{exactDateTime(record.data.expires_at)}</time></dd></div><div><dt>Context ID</dt><dd><code>{record.data.id}</code></dd></div></dl>
    {!retained ? <p className="agent-notice" role="status">{record.data.deleted_at ? "Deleted context. Every retained version was erased." : "Retention expired. No version text or evidence can be read. Retention cannot be extended."}</p> : <>
      <div className="agent-controls"><button className="button secondary" type="button" onClick={() => setReading(!reading)}>{reading ? "Hide source" : "Read retained version"}</button>{canWrite && <><button className="button secondary" type="button" disabled={busy} onClick={() => { setEditing(!editing); version.reset(); }}>Add new version</button><button className="button secondary" type="button" disabled={busy} onClick={() => setDeleting(!deleting)}>Delete context</button></>}</div>
      {reading && <div className="context-source"><div className="field"><label htmlFor="context-version">Version number</label><input className="input" id="context-version" type="number" min={1} max={record.data.current_version} value={versionNumber} onChange={(event) => { const n = Number(event.target.value); if (Number.isInteger(n) && n >= 1 && n <= record.data!.current_version) setVersion(n); }} /></div><ContextSource organizationId={organizationId} recordId={recordId} versionNumber={versionNumber} /></div>}
      {editing && canWrite && <form className="context-editor" onSubmit={(event) => { event.preventDefault(); if (retained && canWrite && !version.error) version.mutate({ text: String(new FormData(event.currentTarget).get("text")).trim(), expected_version: record.data!.current_version }); }}><h3>Save a new version</h3><p>Based on version {record.data.current_version}. The original expiry stays unchanged. Review the current source before replacing it.</p><label htmlFor="context-version-text">Replacement source text</label><textarea id="context-version-text" className="textarea" name="text" required maxLength={100000} rows={8} disabled={busy || Boolean(version.error)} /><button className="button" type="submit" disabled={busy || Boolean(version.error)}>{version.isPending ? "Saving version…" : "Save new version"}</button>{version.error && <ContextError error={version.error} retry={refresh} />}</form>}
      {deleting && canWrite && <div className="context-delete"><h3>Erase every retained version?</h3><p>This permanently erases retained source text for <strong>{record.data.title}</strong>. Evidence reads and unfinished actions using this context will be blocked. Metadata, source hashes, caller-supplied task/plan text, created tasks and database backups are not erased by this action.</p><label htmlFor="context-delete-confirm">Type DELETE to erase this context</label><input id="context-delete-confirm" className="input" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /><div className="agent-controls"><button className="button danger" type="button" disabled={busy || confirmation !== "DELETE"} onClick={() => { if (canWrite && retained && confirmation === "DELETE") deletion.mutate(); }}>{deletion.isPending ? "Erasing source…" : "Erase all retained versions"}</button><button className="button secondary" type="button" disabled={busy} onClick={() => { setDeleting(false); setConfirmation(""); }}>Keep context</button></div></div>}
    </>}
    {deletion.error && <ContextError error={deletion.error} retry={refresh} />}
  </section>}</>;
}

// Mount only while explicitly reading an authorized retained source. Unmounting
// aborts in-flight reads and makes gcTime: 0 clear the source query immediately.
function ContextSource({ organizationId, recordId, versionNumber }: { organizationId: string; recordId: string; versionNumber: number }) {
  const source = useQuery({
    queryKey: ["context-record", organizationId, recordId, "version", versionNumber],
    queryFn: async ({ signal }) => {
      const data = await api.contextVersion(organizationId, recordId, versionNumber, signal);
      if (data.record_id !== recordId || data.version_number !== versionNumber) throw new ApiError("Context version response did not match the requested source.", 502);
      return data;
    },
    retry: false,
    gcTime: 0,
  });
  return <>{source.isLoading && <PageLoading rows={4} />}{source.error && <ContextError error={source.error} retry={() => void source.refetch()} />}{source.data && !source.error && <><p>Version {source.data.version_number} · <time dateTime={source.data.created_at}>{exactDateTime(source.data.created_at)}</time></p><p className="field-help">Full-source SHA-256 (UTF-8): <code>{source.data.source_sha256}</code></p><pre>{source.data.text}</pre></>}</>;
}
