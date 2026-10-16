"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { CalendarConnection } from "@/components/calendar-connection";
import { api } from "@/lib/api";
import type { IntegrationProvider } from "@/lib/types";
import { formatRelativeDate, titleCase } from "@/lib/utils";

function useOneTimeValue() {
  const [value, setValue] = useState("");
  const alive = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    alive.current = true;
    const clear = () => { epoch.current += 1; setValue(""); };
    const visibility = () => { if (document.visibilityState === "hidden") clear(); };
    window.addEventListener("pagehide", clear);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive.current = false;
      epoch.current += 1;
      window.removeEventListener("pagehide", clear);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return { value, begin: () => {
    const request = ++epoch.current;
    return (next: string) => { if (alive.current && epoch.current === request && document.visibilityState !== "hidden") setValue(next); };
  }, clear: () => { epoch.current += 1; setValue(""); } };
}

function SecretOnce({ label, value, dismiss }: { label: string; value: string; dismiss: () => void }) {
  if (!value) return null;
  return <div className="settings-secret" data-sensitive="true" data-private="true" data-dd-privacy="hidden">
    <label htmlFor="settings-one-time-value">{label}</label><input className="input" id="settings-one-time-value" value={value} readOnly autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} />
    <p>Copy it now into a server-side secret manager. Navigation, changing workspace or hiding this tab clears this display. It is never saved in browser storage.</p>
    <button className="button secondary" type="button" onClick={dismiss}>Dismiss secret</button>
  </div>;
}

export function ApiKeys({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const secret = useOneTimeValue();
  const keys = useQuery({ queryKey: ["api-keys", organizationId], queryFn: () => api.apiKeys(organizationId), retry: false });
  const create = useMutation({ mutationFn: async () => {
    const show = secret.begin();
    const created = await api.createApiKey(organizationId, { name, scopes: ["contracts:write", "contracts:read"] });
    show(created.token);
    // Only metadata can enter TanStack's mutation cache, never the bearer.
    return created.api_key;
  }, onSuccess: () => { setName(""); return client.invalidateQueries({ queryKey: ["api-keys", organizationId] }); }, retry: false, gcTime: 0 });
  const revoke = useMutation({ mutationFn: (id: string) => api.revokeApiKey(organizationId, id), onSuccess: () => client.invalidateQueries({ queryKey: ["api-keys", organizationId] }), retry: false });
  return <section className="settings-tool" aria-labelledby="public-keys-heading"><h3 id="public-keys-heading">Public API keys</h3>
    <p>Document intake and status access: <code>contracts:write</code> and <code>contracts:read</code>. For agent credentials and exact delegated tools, use <Link href="/agents">Agents</Link>.</p>
    <form className="settings-inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim().length >= 2 && !create.isPending) create.mutate(); }}>
      <div className="settings-field"><label htmlFor="api-key-label">API key label</label><input className="input" id="api-key-label" value={name} maxLength={255} onChange={(event) => setName(event.target.value)} /></div>
      <button className="button secondary" type="submit" disabled={name.trim().length < 2 || create.isPending}>{create.isPending ? "Creating…" : "Create key"}</button>
    </form>
    <SecretOnce label="Copy this public API token now" value={secret.value} dismiss={secret.clear} />
    {create.isSuccess && !secret.value && <p role="status">Key created; its one-time display was cleared. If you did not save it, revoke the key before creating another.</p>}
    {create.isPending && <p role="status">If you leave now, inspect the key list before trying again. Creation is not automatically retried.</p>}
    {(create.error || revoke.error) && <p className="form-error" role="alert">{(create.error || revoke.error)?.message}</p>}
    {keys.isPending ? <p role="status">Loading API key records…</p> : keys.error ? <p className="form-error" role="alert">{keys.error.message}</p> : <div className="settings-records">{keys.data.length ? keys.data.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{item.key_prefix} · {item.revoked_at ? "Revoked" : item.last_used_at ? `Used ${formatRelativeDate(item.last_used_at)}` : "Never used"}</small></div>{!item.revoked_at && <button className="button secondary" type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(item.id)}>Revoke {item.name}</button>}</article>) : <p>No public API keys in this workspace.</p>}</div>}
  </section>;
}

export function IntegrationSettings({ organizationId }: { organizationId: string }) {
  const client = useQueryClient();
  const [provider, setProvider] = useState<IntegrationProvider>("google_drive");
  const [displayName, setDisplayName] = useState("");
  const [externalId, setExternalId] = useState("");
  const [url, setUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const secret = useOneTimeValue();
  const connections = useQuery({ queryKey: ["integrations", organizationId], queryFn: () => api.integrations(organizationId), retry: false });
  const providers = useQuery({ queryKey: ["integration-providers", organizationId], queryFn: () => api.integrationProviders(organizationId), retry: false });
  const address = useQuery({ queryKey: ["intake-email-address", organizationId], queryFn: () => api.intakeEmailAddress(organizationId), retry: false });
  const imports = useQuery({ queryKey: ["integration-imports", organizationId], queryFn: () => api.integrationImports(organizationId), retry: false });
  const hooks = useQuery({ queryKey: ["webhooks", organizationId], queryFn: () => api.webhooks(organizationId), retry: false });
  const deliveries = useQuery({ queryKey: ["webhook-deliveries", organizationId], queryFn: () => api.webhookDeliveries(organizationId), retry: false });
  const addConnection = useMutation({ mutationFn: () => api.createIntegration(organizationId, { provider, display_name: displayName, external_account_id: externalId }), onSuccess: () => {
    setDisplayName(""); setExternalId(""); return client.invalidateQueries({ queryKey: ["integrations", organizationId] });
  }, retry: false });
  const revokeConnection = useMutation({ mutationFn: (id: string) => api.revokeIntegration(organizationId, id), onSuccess: () => client.invalidateQueries({ queryKey: ["integrations", organizationId] }), retry: false });
  const addWebhook = useMutation({ mutationFn: async () => {
    const show = secret.begin();
    const created = await api.createWebhook(organizationId, { target_url: url, events: ["contract.created", "contract.review_ready"] });
    show(created.signing_secret);
    return created.subscription;
  }, onSuccess: () => { setUrl(""); return client.invalidateQueries({ queryKey: ["webhooks", organizationId] }); }, retry: false, gcTime: 0 });
  const revokeWebhook = useMutation({ mutationFn: (id: string) => api.revokeWebhook(organizationId, id), onSuccess: () => client.invalidateQueries({ queryKey: ["webhooks", organizationId] }), retry: false });
  return <div className="settings-integration-tools">
    <CalendarConnection organizationId={organizationId} />
    <section className="settings-tool" aria-labelledby="intake-heading"><h3 id="intake-heading">Contract forwarding address</h3>
      {address.isPending ? <p role="status">Loading forwarding configuration…</p> : address.error ? <p role="alert" className="form-error">{address.error.message}</p> : address.data.enabled && address.data.address ? <><p>Unique to this workspace. Forward PDF, DOCX or TXT contracts.</p><div className="settings-copy-row"><code>{address.data.address}</code><button className="button secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(address.data.address); setCopyStatus("Address copied."); } catch { setCopyStatus("Copy unavailable. Select the address and copy it manually."); } }}>Copy address</button></div><p>{address.data.instructions}</p></> : <p>Forwarding is not configured for this workspace. {address.data.instructions}</p>}
      {copyStatus && <p role="status">{copyStatus}</p>}
    </section>
    <section className="settings-tool" aria-labelledby="providers-heading"><h3 id="providers-heading">Available connectors</h3>
      {providers.error ? <p className="form-error" role="alert">{providers.error.message}</p> : <div className="settings-provider-list">{providers.data?.map((item) => <article key={item.provider}><div><strong>{item.display_name}</strong><small>{titleCase(item.category)} · {titleCase(item.connection_mode)} · {item.capabilities.map(titleCase).join(", ")}</small></div><span>{item.configured ? "Available" : "Needs connection"}</span></article>)}{providers.isPending && <p role="status">Loading connector capabilities…</p>}</div>}
    </section>
    <section className="settings-tool" aria-labelledby="connections-heading"><h3 id="connections-heading">Connections</h3><p>Register an intake source. A connection record alone does not establish provider access.</p>
      <form onSubmit={(event) => { event.preventDefault(); if (displayName.trim().length >= 2 && !addConnection.isPending) addConnection.mutate(); }} className="settings-connection-form">
        <div className="settings-field"><label htmlFor="settings-provider">Integration provider</label><AppSelect id="settings-provider" value={provider} onValueChange={(value) => setProvider(value as IntegrationProvider)} options={["google_drive", "onedrive", "sharepoint", "dropbox", "slack", "telegram", "whatsapp", "email"].map((value) => ({ value, label: titleCase(value) }))} /></div>
        <div className="settings-field"><label htmlFor="connection-label">Connection label</label><input className="input" id="connection-label" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
        <div className="settings-field"><label htmlFor="connection-account">Account, folder, channel or address ID</label><input className="input" id="connection-account" value={externalId} onChange={(event) => setExternalId(event.target.value)} /></div>
        <button className="button secondary" type="submit" disabled={displayName.trim().length < 2 || addConnection.isPending}>{addConnection.isPending ? "Adding…" : "Add connection"}</button>
      </form>
      {(connections.error || addConnection.error || revokeConnection.error) && <p className="form-error" role="alert">{(connections.error || addConnection.error || revokeConnection.error)?.message}</p>}
      <div className="settings-records">{connections.data?.filter((item) => item.provider !== "google_calendar").map((item) => <article key={item.id}><div><strong>{item.display_name}</strong><small>{titleCase(item.provider)} · {titleCase(item.status)} · {item.capabilities.map(titleCase).join(", ")}</small></div>{item.status === "active" && <button className="button secondary" type="button" disabled={revokeConnection.isPending} onClick={() => revokeConnection.mutate(item.id)}>Revoke {item.display_name}</button>}</article>)}{connections.isPending ? <p role="status">Loading connections…</p> : connections.data && !connections.data.some((item) => item.provider !== "google_calendar") && <p>No other intake connections.</p>}</div>
    </section>
    <section className="settings-tool" aria-labelledby="webhooks-heading"><h3 id="webhooks-heading">Webhooks</h3><p>Notify a registered HTTPS endpoint when a contract is created or its review is ready.</p>
      <form className="settings-inline-form" onSubmit={(event) => { event.preventDefault(); if (url.startsWith("https://") && !addWebhook.isPending) addWebhook.mutate(); }}><div className="settings-field"><label htmlFor="webhook-url">Webhook endpoint</label><input className="input" id="webhook-url" type="url" placeholder="https://example.com/webhooks/lenslayer" value={url} onChange={(event) => setUrl(event.target.value)} /></div><button className="button secondary" type="submit" disabled={!url.startsWith("https://") || addWebhook.isPending}>{addWebhook.isPending ? "Adding…" : "Add webhook"}</button></form>
      <SecretOnce label="Copy this webhook signing secret now" value={secret.value} dismiss={secret.clear} />
      {(hooks.error || addWebhook.error || revokeWebhook.error) && <p className="form-error" role="alert">{(hooks.error || addWebhook.error || revokeWebhook.error)?.message}</p>}
      <div className="settings-records">{hooks.data?.map((item) => <article key={item.id}><div><strong>{item.target_url}</strong><small>{item.events.join(", ")} · {titleCase(item.status)}</small></div>{item.status === "active" && <button className="button secondary" type="button" disabled={revokeWebhook.isPending} onClick={() => revokeWebhook.mutate(item.id)}>Revoke webhook</button>}</article>)}{hooks.isPending ? <p role="status">Loading webhooks…</p> : hooks.data?.length === 0 && <p>No webhooks registered.</p>}</div>
    </section>
    <section className="settings-tool" aria-labelledby="recent-intake-heading"><h3 id="recent-intake-heading">Recent intake</h3>{imports.error && <p className="form-error" role="alert">{imports.error.message}</p>}<div className="settings-records">{imports.data?.slice(0, 6).map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{titleCase(item.provider)} · {titleCase(item.status)} · {formatRelativeDate(item.created_at)}</small></div>{item.contract_id && <Link href={`/contracts/${item.contract_id}`}>Open contract</Link>}</article>)}{imports.isPending ? <p role="status">Loading recent intake…</p> : imports.data?.length === 0 && <p>No recent intake records.</p>}</div></section>
    <section className="settings-tool" aria-labelledby="deliveries-heading"><h3 id="deliveries-heading">Delivery log</h3>{deliveries.error && <p className="form-error" role="alert">{deliveries.error.message}</p>}<div className="settings-records">{deliveries.data?.slice(0, 6).map((item) => <article key={item.id}><div><strong>{titleCase(item.event_type.replaceAll(".", " "))}</strong><small>{titleCase(item.status)} · {formatRelativeDate(item.created_at)}</small></div>{item.contract_id && <Link href={`/contracts/${item.contract_id}`}>Open contract</Link>}</article>)}{deliveries.isPending ? <p role="status">Loading delivery records…</p> : deliveries.data?.length === 0 && <p>No webhook deliveries recorded.</p>}</div></section>
  </div>;
}
