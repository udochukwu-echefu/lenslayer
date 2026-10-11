"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { takeCalendarCallback, type CalendarCallback, type PendingCalendarConsent } from "@/lib/calendar-consent";
import { useWorkspace } from "./workspace-provider";
import { BrandMark } from "./brand-mark";
import { useBoundaryClock } from "./agents/use-boundary-clock";
import "./calendar-connection.css";

export function CalendarConsentReturn() {
  const workspace = useWorkspace();
  const client = useQueryClient();
  const capture = useRef<{ input: CalendarCallback | null } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [view, setView] = useState<"loading" | "ready" | "sending" | "connected" | "restart">("loading");
  const [connectionId, setConnectionId] = useState("");
  const [input, setInput] = useState<PendingCalendarConsent | null>(null);
  useEffect(() => {
    if (!capture.current) {
      try { capture.current = { input: takeCalendarCallback(new URL(window.location.href), window.history, window.sessionStorage) }; }
      catch { capture.current = { input: null }; window.history.replaceState(null, "", window.location.pathname); }
    }
    let alive = true;
    const captured = capture.current.input;
    queueMicrotask(() => {
      if (!alive) return;
      setInput(captured ? { organizationId: captured.organizationId, userId: captured.userId, expiresAt: captured.expiresAt } : null);
      setView(captured ? "ready" : "restart");
    });
    const clear = () => { if (capture.current) capture.current.input = null; pending.current?.abort(); setView("restart"); };
    window.addEventListener("pagehide", clear);
    return () => { alive = false; pending.current?.abort(); window.removeEventListener("pagehide", clear); };
  }, []);
  const now = useBoundaryClock([input?.expiresAt ?? null]);
  const organization = workspace.organizations.find((org) => org.id === input?.organizationId);
  const sameHuman = !workspace.isDemo && workspace.user?.id === input?.userId;
  const canComplete = sameHuman && (organization?.role === "owner" || organization?.role === "admin") && Boolean(input) && Date.parse(input!.expiresAt) > now;
  useEffect(() => {
    if (pending.current && !canComplete) {
      pending.current.abort();
      queueMicrotask(() => setView("restart"));
    }
  }, [canComplete]);
  async function complete() {
    if (!canComplete || view !== "ready" || !capture.current?.input) return;
    const original = capture.current.input;
    if (Date.parse(original.expiresAt) <= Date.now()) { capture.current.input = null; setView("restart"); return; }
    capture.current.input = null; // Never retry a one-time code or keep it in a mutation cache.
    pending.current = new AbortController(); setView("sending");
    try {
      const connected = await api.completeCalendarConsent(original.organizationId, { code: original.code, state: original.state }, pending.current.signal);
      if (pending.current.signal.aborted) return;
      setConnectionId(connected.id); workspace.selectOrganization(original.organizationId);
      await client.invalidateQueries({ queryKey: ["integrations", original.organizationId] });
      await client.invalidateQueries({ queryKey: ["integration-providers", original.organizationId] });
      setView("connected");
    } catch { if (!pending.current.signal.aborted) setView("restart"); }
  }
  return <main className="calendar-callback"><Link href="/developers" aria-label="LensLayer developer guide"><BrandMark /></Link><h1>Complete Calendar connection</h1>
    {view === "loading" || (view === "ready" && workspace.isLoading) ? <p role="status">Checking the initiating workspace and signed-in user…</p> : view === "connected" ? <><p role="status">Calendar consent is stored. LensLayer will verify access and approved event fields during dispatch.</p><p>Connection ID: <code>{connectionId}</code></p><Link className="button" href="/agents">Delegate calendar access</Link></> : view === "sending" ? <p role="status">Exchanging the one-time consent code…</p> : view === "ready" && canComplete ? <><p>Complete the connection for <strong>{organization?.name}</strong> as the same person who started consent. The API checks the signed, single-use state and the exact provider grant.</p><button type="button" className="button" onClick={() => void complete()}>Complete connection</button></> : <><p role="alert">Consent could not be completed in this session. Inspect existing connections, then restart consent in Settings while signed in as the initiating workspace owner or administrator.</p><Link className="button secondary" href="/settings#calendar-connection">Return to Calendar settings</Link></>}
    <p>The callback URL has been cleared. Codes and signed state stay only in memory during this exchange. An interrupted or failed exchange is not automatically replayed.</p>
  </main>;
}
