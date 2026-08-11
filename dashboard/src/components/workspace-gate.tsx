"use client";

import { AlertTriangle, ArrowRight, Building2, LoaderCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { useCreateWorkspace, useWorkspace } from "./workspace-provider";
import { ApiError } from "@/lib/api";

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { organizations, isLoading, error } = useWorkspace();
  const createWorkspace = useCreateWorkspace();
  const [name, setName] = useState("");

  if (isLoading) {
    return <main className="gate"><LoaderCircle className="gate-spinner" aria-label="Loading workspace" /><p>Opening your workspace…</p></main>;
  }

  if (error) {
    const unavailable = error instanceof ApiError && error.status === 503;
    return (
      <main className="gate">
        <div className="gate-card">
          <AlertTriangle size={24} aria-hidden="true" />
          <p className="eyebrow">Connection needed</p>
          <h1>The workspace could not open.</h1>
          <p>{unavailable ? "Refresh the page to reopen the demo workspace." : "LensLayer could not load this workspace. Refresh the page and try again."}</p>
          <button className="button" type="button" onClick={() => window.location.reload()}>Refresh workspace<ArrowRight size={16} /></button>
        </div>
      </main>
    );
  }

  if (organizations.length) return children;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = slugify(name);
    if (!slug) return;
    await createWorkspace.mutateAsync({ name: name.trim(), slug });
  }

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-symbol"><Building2 size={20} /></div>
        <p className="eyebrow">Workspace setup</p>
        <h1>Create a workspace</h1>
        <p>Set the shared boundary for agreements, evidence, reviewers, and activity history.</p>
        <div className="field">
          <label htmlFor="workspace-name">Workspace name</label>
          <input id="workspace-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Operations" minLength={2} maxLength={255} required autoFocus />
          <p className="field-help">This appears on reviews, audit activity, and future team invitations.</p>
        </div>
        {createWorkspace.error && <p className="form-error" role="alert">{createWorkspace.error.message}</p>}
        <button className="button" type="submit" disabled={createWorkspace.isPending || name.trim().length < 2}>
          {createWorkspace.isPending ? "Creating workspace…" : "Create workspace"}<ArrowRight size={16} />
        </button>
      </form>
    </main>
  );
}
