"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

const CONFIRMATION = "DELETE";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const preview = useQuery({ queryKey: ["account-deletion"], queryFn: api.accountDeletionPreview, enabled: open, retry: false });
  const deletion = useMutation({
    mutationFn: () => api.deleteAccount(typed),
    onSuccess: async () => {
      await signOut({ redirect: false });
      window.location.assign("/auth/logout");
    },
  });
  const blockers = preview.data?.blocking_workspaces ?? [];

  return <section className="settings-delete-account" aria-labelledby="delete-account-title">
    <h3 id="delete-account-title">Delete account</h3>
    <p>Workspaces where you are the only member are deleted with their contracts, reviews and files. In shared workspaces you are removed, your API keys and agent credentials stop working, and your past activity is shown as &ldquo;Deleted user&rdquo;. This can&rsquo;t be undone.</p>
    {!open ? <button className="button danger" type="button" onClick={() => setOpen(true)}>Delete my account</button> : <>
      {preview.isLoading && <p role="status" className="settings-access-note">Checking your workspaces…</p>}
      {blockers.length > 0 ? <p role="alert" className="settings-delete-blocked">
        You&rsquo;re the only owner of {blockers.join(", ")}. <Link href="/team">Make another member an owner</Link> first, then come back.
      </p> : !preview.isLoading && <form onSubmit={(event) => { event.preventDefault(); deletion.mutate(); }}>
        <label htmlFor="delete-account-confirmation">Type <strong>{CONFIRMATION}</strong> to confirm</label>
        <input id="delete-account-confirmation" className="input" value={typed} autoComplete="off" spellCheck={false}
          onChange={(event) => setTyped(event.target.value)} disabled={deletion.isPending || deletion.isSuccess} />
        {deletion.error && <p role="alert" className="settings-delete-blocked">{deletion.error.message}</p>}
        <div className="settings-delete-actions">
          <button className="button secondary" type="button" onClick={() => { setOpen(false); setTyped(""); deletion.reset(); }} disabled={deletion.isPending}>Cancel</button>
          <button className="button danger" type="submit" disabled={typed !== CONFIRMATION || deletion.isPending || deletion.isSuccess}>
            {deletion.isPending ? "Deleting…" : deletion.isSuccess ? "Signing out…" : "Permanently delete"}
          </button>
        </div>
      </form>}
    </>}
  </section>;
}
