"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function OneTimeCredential({ token, dismiss }: { token: string; dismiss: () => void }) {
  const [result, setResult] = useState<{ token: string; status: "idle" | "copying" | "copied" | "manual" }>({ token: "", status: "idle" });
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<{ token: string; field: HTMLInputElement } | null>(null);
  const status = result.token === token ? result.status : "idle";

  useEffect(() => () => { pending.current = null; }, [token]);

  function selectCredential() {
    input.current?.focus();
    input.current?.select();
  }

  async function copy() {
    const field = input.current;
    if (!field?.isConnected || field.value !== token || pending.current?.token === token) return;
    const request = { token, field };
    pending.current = request;
    const current = () => pending.current === request && input.current === field && field.isConnected && field.value === token;
    setResult({ token, status: "copying" });
    try {
      await navigator.clipboard.writeText(token);
      if (current()) setResult({ token, status: "copied" });
    } catch {
      if (!current()) return;
      field.focus();
      field.select();
      // Older browsers and embedded views can block the async Clipboard API.
      // This fallback copies only the selected field after an explicit click.
      try {
        if (current() && document.activeElement === field && field.selectionStart === 0 && field.selectionEnd === token.length && document.execCommand?.("copy")) {
          setResult({ token, status: "copied" });
          return;
        }
      } catch { /* Keep the selected field available for the keyboard shortcut. */ }
      if (current()) setResult({ token, status: "manual" });
    } finally {
      if (pending.current === request) pending.current = null;
    }
  }

  return <section className="agent-credential panel" aria-labelledby="credential-heading" data-sensitive="true" data-private="true" data-dd-privacy="hidden">
    <h2 id="credential-heading">Save this credential now</h2>
    <p>It is shown once. Keep it in a server-side environment variable or secret manager, never in browser storage or a client bundle.</p>
    <div className="field"><label htmlFor="agent-credential">Agent bearer credential</label><input ref={input} id="agent-credential" className="input" value={token} readOnly autoComplete="off" spellCheck={false} onClick={selectCredential} /></div>
    <div className="agent-controls"><button className="button secondary" type="button" disabled={status === "copying"} onClick={copy}>{status === "copied" ? <Check size={16} /> : <Copy size={16} />}{status === "copied" ? "Copied" : status === "copying" ? "Copying…" : "Copy credential"}</button><button className="button" type="button" onClick={dismiss}>I saved it. Dismiss</button></div>
    {status === "copied" && <p className="field-help" role="status">Credential copied.</p>}
    {status === "manual" && <p className="form-error" role="alert">The credential is selected. Press ⌘C on Mac or Ctrl+C on Windows/Linux to copy it before dismissing.</p>}
    <p className="field-help">Dismissal, navigation, changing workspace, or hiding this tab clears this display. Your clipboard is not automatically cleared.</p>
  </section>;
}
