"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Copy, Database, FileUp, KeyRound, Link2, Mail, PlugZap, Save, ShieldCheck, UserRound, UsersRound, Webhook } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppSelect } from "@/components/app-select";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import type { IntegrationProvider, OrganizationSettings } from "@/lib/types";
import { formatDate, formatRelativeDate, titleCase } from "@/lib/utils";

type SettingsDraft = Pick<
  OrganizationSettings,
  "name" | "default_retention_days" | "default_retain_document" | "default_retain_source_text" | "notification_review_ready" | "notification_review_failed"
>;

function IntegrationAdmin({ organizationId, canManageTeam }: { organizationId: string; canManageTeam: boolean }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<IntegrationProvider>("google_drive");
  const [displayName, setDisplayName] = useState("");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [addressCopied, setAddressCopied] = useState(false);
  const integrationsQuery = useQuery({ queryKey: ["integrations", organizationId], queryFn: () => api.integrations(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const importsQuery = useQuery({ queryKey: ["integration-imports", organizationId], queryFn: () => api.integrationImports(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const apiKeysQuery = useQuery({ queryKey: ["api-keys", organizationId], queryFn: () => api.apiKeys(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const webhooksQuery = useQuery({ queryKey: ["webhooks", organizationId], queryFn: () => api.webhooks(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const deliveriesQuery = useQuery({ queryKey: ["webhook-deliveries", organizationId], queryFn: () => api.webhookDeliveries(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const providersQuery = useQuery({ queryKey: ["integration-providers", organizationId], queryFn: () => api.integrationProviders(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const intakeAddressQuery = useQuery({ queryKey: ["intake-email-address", organizationId], queryFn: () => api.intakeEmailAddress(organizationId), enabled: Boolean(organizationId) && canManageTeam });
  const integrationMutation = useMutation({
    mutationFn: () => api.createIntegration(organizationId, { provider, display_name: displayName, external_account_id: externalAccountId }),
    onSuccess: async () => {
      setDisplayName("");
      setExternalAccountId("");
      await queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] });
    },
  });
  const revokeIntegrationMutation = useMutation({ mutationFn: (id: string) => api.revokeIntegration(organizationId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations", organizationId] }) });
  const apiKeyMutation = useMutation({
    mutationFn: () => api.createApiKey(organizationId, { name: apiKeyName, scopes: ["contracts:write", "contracts:read"] }),
    onSuccess: async (created) => {
      setApiToken(created.token);
      setApiKeyName("");
      await queryClient.invalidateQueries({ queryKey: ["api-keys", organizationId] });
    },
  });
  const revokeApiKeyMutation = useMutation({ mutationFn: (id: string) => api.revokeApiKey(organizationId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys", organizationId] }) });
  const webhookMutation = useMutation({
    mutationFn: () => api.createWebhook(organizationId, { target_url: webhookUrl, events: ["contract.created", "contract.review_ready"] }),
    onSuccess: async (created) => {
      setWebhookSecret(created.signing_secret);
      setWebhookUrl("");
      await queryClient.invalidateQueries({ queryKey: ["webhooks", organizationId] });
    },
  });
  const revokeWebhookMutation = useMutation({ mutationFn: (id: string) => api.revokeWebhook(organizationId, id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks", organizationId] }) });

  if (!canManageTeam) return <p className="settings-note">Only owners and administrators can manage intake integrations, API keys, and webhook endpoints.</p>;
  return <div className="integration-admin">
    <div className="integration-panel wide"><h3><Mail size={15} />Contract forwarding address</h3>{intakeAddressQuery.data && <div className="intake-address"><div className="intake-address-meta"><span className="intake-address-status">Ready for intake</span><span>Unique to this workspace</span></div><div className="intake-address-copy"><span><small>Forward contracts to</small><code>{intakeAddressQuery.data.address}</code></span><button className="button secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(intakeAddressQuery.data.address); setAddressCopied(true); window.setTimeout(() => setAddressCopied(false), 2000); } catch { setAddressCopied(false); } }}>{addressCopied ? <Check size={16} /> : <Copy size={16} />}{addressCopied ? "Copied" : "Copy address"}</button></div><div className="intake-address-guidance"><FileUp size={18} /><p>{intakeAddressQuery.data.instructions}</p><span>PDF · DOCX · TXT</span></div></div>}</div>
    <div className="integration-panel wide"><h3><PlugZap size={15} />Available connectors</h3><div className="provider-catalog">{(providersQuery.data ?? []).map((item) => <article key={item.provider}><div><strong>{item.display_name}</strong><span>{titleCase(item.category)} · {titleCase(item.connection_mode)}</span></div><small>{item.capabilities.map((value) => titleCase(value)).join(" · ")}</small><span className={`provider-state ${item.configured ? "configured" : ""}`}>{item.configured ? "Available" : "Needs connection"}</span></article>)}</div></div>
    <div className="integration-panel"><h3><PlugZap size={15} />Connections</h3><div className="integration-form"><AppSelect value={provider} ariaLabel="Integration provider" onValueChange={(value) => setProvider(value as IntegrationProvider)} options={[{ value: "google_drive", label: "Google Drive" }, { value: "onedrive", label: "OneDrive" }, { value: "sharepoint", label: "SharePoint" }, { value: "dropbox", label: "Dropbox" }, { value: "slack", label: "Slack" }, { value: "telegram", label: "Telegram" }, { value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Forwarding email" }]} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Connection label" /><input value={externalAccountId} onChange={(event) => setExternalAccountId(event.target.value)} placeholder="Account, folder, channel, or address ID" /><button className="button secondary" disabled={displayName.trim().length < 2 || integrationMutation.isPending} onClick={() => integrationMutation.mutate()}><PlugZap size={14} />Add</button></div>{integrationMutation.error && <p className="form-error">{integrationMutation.error.message}</p>}<div className="integration-list">{(integrationsQuery.data ?? []).map((item) => <article key={item.id}><span><strong>{item.display_name}</strong><small>{titleCase(item.provider)} · {titleCase(item.status)} · {item.capabilities.map((value) => titleCase(value)).join(", ")}</small></span>{item.status === "active" && <button onClick={() => revokeIntegrationMutation.mutate(item.id)}>Revoke</button>}</article>)}</div></div>
    <div className="integration-panel"><h3><KeyRound size={15} />Public API keys</h3><div className="integration-form two"><input value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} placeholder="API key label" /><button className="button secondary" disabled={apiKeyName.trim().length < 2 || apiKeyMutation.isPending} onClick={() => apiKeyMutation.mutate()}><KeyRound size={14} />Create key</button></div>{apiToken && <div className="secret-once"><strong>Copy this token now</strong><code>{apiToken}</code></div>}{apiKeyMutation.error && <p className="form-error">{apiKeyMutation.error.message}</p>}<div className="integration-list">{(apiKeysQuery.data ?? []).map((item) => <article key={item.id}><span><strong>{item.name}</strong><small>{item.key_prefix} · {item.revoked_at ? "Revoked" : item.last_used_at ? `Used ${formatRelativeDate(item.last_used_at)}` : "Never used"}</small></span>{!item.revoked_at && <button onClick={() => revokeApiKeyMutation.mutate(item.id)}>Revoke</button>}</article>)}</div></div>
    <div className="integration-panel"><h3><Webhook size={15} />Webhooks</h3><div className="integration-form two"><input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://example.com/webhooks/lenslayer" /><button className="button secondary" disabled={!webhookUrl.startsWith("https://") || webhookMutation.isPending} onClick={() => webhookMutation.mutate()}><Webhook size={14} />Add webhook</button></div>{webhookSecret && <div className="secret-once"><strong>Copy this signing secret now</strong><code>{webhookSecret}</code></div>}{webhookMutation.error && <p className="form-error">{webhookMutation.error.message}</p>}<div className="integration-list">{(webhooksQuery.data ?? []).map((item) => <article key={item.id}><span><strong>{item.target_url}</strong><small>{item.events.join(", ")} · {titleCase(item.status)}</small></span>{item.status === "active" && <button onClick={() => revokeWebhookMutation.mutate(item.id)}>Revoke</button>}</article>)}</div></div>
    <div className="integration-panel wide"><h3><Link2 size={15} />Recent intake</h3><div className="integration-list">{(importsQuery.data ?? []).slice(0, 6).map((item) => <article key={item.id}><span><strong>{item.title}</strong><small>{titleCase(item.provider)} · {titleCase(item.status)} · {formatRelativeDate(item.created_at)}</small></span>{item.contract_id && <Link href={`/contracts/${item.contract_id}`}>Open</Link>}</article>)}</div></div>
    <div className="integration-panel wide"><h3><Webhook size={15} />Delivery log</h3><div className="integration-list">{(deliveriesQuery.data ?? []).slice(0, 6).map((item) => <article key={item.id}><span><strong>{titleCase(item.event_type.replaceAll(".", " "))}</strong><small>{titleCase(item.status)} · {formatRelativeDate(item.created_at)}</small></span>{item.contract_id && <Link href={`/contracts/${item.contract_id}`}>Contract</Link>}</article>)}</div></div>
  </div>;
}

export default function SettingsPage() {
  const { activeOrganization, user, canManageTeam, isDemo } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["organization-settings", organizationId],
    queryFn: () => api.organizationSettings(organizationId),
    enabled: Boolean(organizationId),
  });
  const [draftState, setDraftState] = useState<{ organizationId: string; value: SettingsDraft } | null>(null);
  const saveMutation = useMutation({
    mutationFn: (payload: SettingsDraft) => api.updateOrganizationSettings(organizationId, payload),
    onSuccess: async (updated) => {
      setDraftState({ organizationId, value: {
        name: updated.name,
        default_retention_days: updated.default_retention_days,
        default_retain_document: updated.default_retain_document,
        default_retain_source_text: updated.default_retain_source_text,
        notification_review_ready: updated.notification_review_ready,
        notification_review_failed: updated.notification_review_failed,
      } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
        queryClient.invalidateQueries({ queryKey: ["organization-settings", organizationId] }),
      ]);
    },
  });

  if (settingsQuery.isLoading) return <div className="page"><PageLoading rows={8} /></div>;
  if (settingsQuery.error) return <div className="page"><PageError error={settingsQuery.error} /></div>;
  if (!settingsQuery.data) return null;

  if (!canManageTeam) return <div className="page settings-page viewer-settings">
    <div className="page-heading"><div><h1 className="page-title">Settings</h1><p className="page-description">Read-only workspace policy and access summary.</p></div></div>
    <section className="viewer-summary" aria-labelledby="viewer-summary-title">
      <div><ShieldCheck size={19} /><div><h2 id="viewer-summary-title">Viewer access</h2><p>{isDemo ? "This read-only demo is isolated from private customer workspaces." : "Workspace administrators manage these settings."}</p></div></div>
      <dl>
        <div><dt>Workspace</dt><dd>{settingsQuery.data.name}</dd></div>
        <div><dt>Role</dt><dd>{titleCase(activeOrganization?.role ?? "viewer")}</dd></div>
        <div><dt>Retention policy</dt><dd>{settingsQuery.data.default_retention_days} days</dd></div>
        <div><dt>Notification behavior</dt><dd>{settingsQuery.data.notification_review_ready && settingsQuery.data.notification_review_failed ? "Review completion and failure alerts" : "Limited alerts"}</dd></div>
        <div><dt>Connected integrations</dt><dd>{isDemo ? "None in the synthetic demo" : "Managed by administrators"}</dd></div>
        <div><dt>Security boundary</dt><dd>{isDemo ? "Synthetic records only; no private customer data" : "Private workspace access controls apply"}</dd></div>
      </dl>
    </section>
    <section className="managed-settings"><h2>Managed by workspace administrators</h2><p>Workspace naming, retention defaults, notifications, integrations, API keys, webhooks, and team permissions.</p></section>
    <section className="viewer-identity"><h2>Demo identity</h2><dl><div><dt>Display name</dt><dd>{user?.display_name}</dd></div><div><dt>Viewer ID</dt><dd className="mono">{user?.id}</dd></div></dl></section>
  </div>;

  const initialDraft: SettingsDraft = {
    name: settingsQuery.data.name,
    default_retention_days: settingsQuery.data.default_retention_days,
    default_retain_document: settingsQuery.data.default_retain_document,
    default_retain_source_text: settingsQuery.data.default_retain_source_text,
    notification_review_ready: settingsQuery.data.notification_review_ready,
    notification_review_failed: settingsQuery.data.notification_review_failed,
  };
  const draft = draftState?.organizationId === organizationId ? draftState.value : initialDraft;
  const updateDraft = (value: SettingsDraft) => setDraftState({ organizationId, value });

  const changed = JSON.stringify(draft) !== JSON.stringify({
    name: settingsQuery.data?.name,
    default_retention_days: settingsQuery.data?.default_retention_days,
    default_retain_document: settingsQuery.data?.default_retain_document,
    default_retain_source_text: settingsQuery.data?.default_retain_source_text,
    notification_review_ready: settingsQuery.data?.notification_review_ready,
    notification_review_failed: settingsQuery.data?.notification_review_failed,
  });

  return <div className="page settings-page">
    <div className="page-heading"><div><h1 className="page-title">Settings</h1><p className="page-description">Workspace defaults, integrations, notifications, and security controls.</p></div>{canManageTeam && <button className="button" disabled={!changed || saveMutation.isPending || draft.name.trim().length < 2} onClick={() => saveMutation.mutate(draft)}><Save size={15} />{saveMutation.isPending ? "Saving…" : "Save changes"}</button>}</div>
    {saveMutation.isSuccess && <p className="form-success" role="status">Workspace settings saved.</p>}
    {saveMutation.error && <p className="form-error" role="alert">{saveMutation.error.message}</p>}
    <div className="settings-layout"><nav aria-label="Settings sections"><a href="#workspace" className="active">Workspace</a><a href="#data">Review defaults</a><a href="#notifications">Notifications</a><a href="#integrations">Integrations</a><a href="#identity">Identity</a><a href="#security">Security</a></nav><div className="settings-content">
      <section id="workspace" className="settings-section"><header><span><Database size={18} /></span><div><h2>Workspace</h2><p>The shared boundary for contracts, people, and activity.</p></div></header><div className="settings-form-row"><label htmlFor="workspace-name">Workspace name</label><div><input id="workspace-name" value={draft.name} disabled={!canManageTeam} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} /><small>Shown in the workspace switcher and exports.</small></div></div><dl><div><dt>Slug</dt><dd>{settingsQuery.data?.slug}</dd></div><div><dt>Your role</dt><dd>{activeOrganization?.role}</dd></div><div><dt>Created</dt><dd>{formatDate(activeOrganization?.created_at)}</dd></div></dl></section>
      <section id="data" className="settings-section"><header><span><ShieldCheck size={18} /></span><div><h2>Review defaults</h2><p>Pre-fill new contract uploads. Reviewers can still choose stricter handling per contract.</p></div></header><div className="settings-form-row"><label htmlFor="retention">Default retention</label><div><AppSelect id="retention" value={String(draft.default_retention_days)} disabled={!canManageTeam} onValueChange={(value) => updateDraft({ ...draft, default_retention_days: Number(value) as 7 | 30 | 90 | 365 })} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "365 days" }]} /><small>Contracts remain deletable at any time.</small></div></div><label className="settings-toggle"><input type="checkbox" checked={draft.default_retain_document} disabled={!canManageTeam} onChange={(event) => updateDraft({ ...draft, default_retain_document: event.target.checked })} /><span><strong>Retain original document by default</strong><small>Needed for later source downloads and reprocessing.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={draft.default_retain_source_text} disabled={!canManageTeam} onChange={(event) => updateDraft({ ...draft, default_retain_source_text: event.target.checked })} /><span><strong>Retain extracted text by default</strong><small>Required for evidence-linked contract Q&amp;A after processing.</small></span></label></section>
      <section id="notifications" className="settings-section"><header><span><BellRing size={18} /></span><div><h2>Notifications</h2><p>Choose which review events create in-product notifications.</p></div></header><label className="settings-toggle"><input type="checkbox" checked={draft.notification_review_ready} disabled={!canManageTeam} onChange={(event) => updateDraft({ ...draft, notification_review_ready: event.target.checked })} /><span><strong>Review completed</strong><small>Notify workspace members when a contract is ready.</small></span></label><label className="settings-toggle"><input type="checkbox" checked={draft.notification_review_failed} disabled={!canManageTeam} onChange={(event) => updateDraft({ ...draft, notification_review_failed: event.target.checked })} /><span><strong>Review failed</strong><small>Notify workspace members when processing needs attention.</small></span></label></section>
      <section id="integrations" className="settings-section"><header><span><PlugZap size={18} /></span><div><h2>Intake and integrations</h2><p>Connect intake sources, create public API keys, and register webhook subscribers.</p></div></header><IntegrationAdmin organizationId={organizationId} canManageTeam={canManageTeam} /></section>
      <section id="identity" className="settings-section"><header><span><UserRound size={18} /></span><div><h2>Account identity</h2><p>The authenticated identity used for attributable workspace actions.</p></div></header><dl><div><dt>Display name</dt><dd>{user?.display_name}</dd></div><div><dt>Email</dt><dd>{user?.email}</dd></div><div><dt>User ID</dt><dd className="mono">{user?.id}</dd></div></dl></section>
      <section id="security" className="settings-section"><header><span><KeyRound size={18} /></span><div><h2>Security boundary</h2><p>Workspace data remains scoped to authorised members and configured retention controls.</p></div></header></section>
      <section className="settings-section"><header><span><UsersRound size={18} /></span><div><h2>Team access</h2><p>Membership, invitations, and least-privilege roles.</p></div></header><p className="settings-note">Owners and administrators manage access in Team. Invitation and role changes appear in the audit record.</p><Link className="button secondary settings-team-link" href="/team">Open team management</Link></section>
    </div></div>
  </div>;
}
