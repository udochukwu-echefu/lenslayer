"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function OneTimeCredential({ token, dismiss }: { token: string; dismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  return <section className="agent-credential panel" aria-labelledby="credential-heading" data-sensitive="true" data-private="true" data-dd-privacy="hidden">
    <h2 id="credential-heading">Save this credential now</h2>
    <p>It is shown once. Keep it in a server-side environment variable or secret manager, never in browser storage or a client bundle.</p>
    <div className="field"><label htmlFor="agent-credential">Agent bearer credential</label><input id="agent-credential" className="input" value={token} readOnly autoComplete="off" spellCheck={false} /></div>
    <div className="agent-controls"><button className="button secondary" type="button" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy credential"}</button><button className="button" type="button" onClick={dismiss}>I saved it. Dismiss</button></div>
    {copyFailed && <p className="form-error" role="alert">Clipboard access failed. Select and copy the credential manually before dismissing.</p>}
    <p className="field-help">Dismissal, navigation, changing workspace, or hiding this tab clears this display. Your clipboard is not automatically cleared.</p>
  </section>;
}
