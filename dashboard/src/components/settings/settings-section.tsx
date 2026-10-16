"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { AppSelect } from "@/components/app-select";
import { DeveloperGuide } from "@/components/agents/developer-guide";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { canAdministerAgents } from "@/lib/agent-state";
import { formatDate, titleCase } from "@/lib/utils";
import { ApiKeys, IntegrationSettings } from "./settings-integrations";
import { policyFields, settingsSections, type SettingsDraft, type SettingsPatch, type SettingsSectionId } from "./sections";
import { useSettingsDrafts } from "./settings-workspace";

export function SettingsSection({ section }: { section: SettingsSectionId }) {
  const workspace = useWorkspace();
  const selected = settingsSections.find((item) => item.id === section)!;
  let content: React.ReactNode;
  if (section === "developers") content = <DeveloperGuide embedded />;
  else if (section === "identity") content = <Identity />;
  else if (workspace.isLoading) content = <PageLoading rows={3} />;
  else if (workspace.error) content = <PageError error={workspace.error} />;
  else if (!workspace.activeOrganization) content = <p className="settings-access-note">Select a workspace to inspect its settings. <Link href="/signin">Sign in</Link> for private workspace access.</p>;
  else {
    const id = workspace.activeOrganization.id;
    const canEdit = workspace.canManageTeam && canAdministerAgents(workspace.activeRole, workspace.isDemo) && Boolean(workspace.user?.id);
    const boundary = `${id}:${workspace.user?.id}:${workspace.activeRole}:${workspace.isDemo}`;
    if (section === "security") content = <><SecurityBoundary />{canEdit ? <ApiKeys key={boundary} organizationId={id} /> : <p className="settings-access-note">Only private workspace owners and administrators can manage public API keys.</p>}</>;
    else if (section === "integrations") content = canEdit ? <IntegrationSettings key={boundary} organizationId={id} /> : <p className="settings-access-note">Only private workspace owners and administrators can manage Calendar consent, intake connections and webhooks.</p>;
    else content = <WorkspacePolicy key={`${id}:${section}`} section={section} organizationId={id} canEdit={canEdit} />;
  }
  return <section className="settings-selected-section" aria-labelledby={`settings-${section}-title`}>
    <header className="settings-section-heading"><h2 id={`settings-${section}-title`}>{selected.label}</h2><p>{selected.description}</p></header>
    {content}
  </section>;
}

function Identity() {
  const { user, activeOrganization, activeRole, isDemo, isLoading, error } = useWorkspace();
  return <>
    {(isLoading || error) && <p role="status" className="settings-access-note">{isLoading ? "Identity is loading. The developer guide remains available." : "Workspace access could not be refreshed. Displayed identity may be incomplete."}</p>}
    <h3>Your profile</h3><dl className="settings-facts">
      <div><dt>Display name</dt><dd>{user?.display_name || "Not available"}</dd></div>
      <div><dt>Email</dt><dd>{user?.email || "Not available"}</dd></div>
      <div><dt>User ID</dt><dd><code>{user?.id || "Not available"}</code></dd></div>
    </dl>
    <h3>Active workspace</h3><dl className="settings-facts">
      <div><dt>Workspace</dt><dd>{activeOrganization?.name || "No workspace selected"}</dd></div>
      <div><dt>Workspace ID</dt><dd><code>{activeOrganization?.id || "Not available"}</code></dd></div>
      <div><dt>Slug</dt><dd>{activeOrganization?.slug || "Not available"}</dd></div>
      <div><dt>Your role</dt><dd>{titleCase(activeRole ?? "No role")}</dd></div>
      <div><dt>Created</dt><dd>{formatDate(activeOrganization?.created_at)}</dd></div>
    </dl><p className="settings-access-note">{isDemo ? "This identity belongs to the isolated synthetic demo." : "Actions are attributed to your signed-in identity and active workspace. Changing workspaces does not widen your role."}</p>
  </>;
}

function SecurityBoundary() {
  const { activeRole, canManageTeam, isDemo } = useWorkspace();
  return <div className="settings-security-summary"><h3>Role and access</h3>
    <p>Your role: <strong>{titleCase(activeRole ?? "No role")}</strong>. Workspace membership and delegated scopes remain separate. Agent credentials cannot approve their own actions.</p>
    <p>Invitation and role changes are recorded in the audit log. Revocation blocks new work; it does not undo completed effects.</p>
    <Link className="button secondary" href="/team">{canManageTeam && !isDemo ? "Manage team access" : "View team access"}</Link>
    <Link className="settings-text-link" href="/agents">Inspect agent delegations</Link>
  </div>;
}

function WorkspacePolicy({ section, organizationId, canEdit }: { section: keyof typeof policyFields; organizationId: string; canEdit: boolean }) {
  const client = useQueryClient();
  const { drafts, edit, saved } = useSettingsDrafts();
  const query = useQuery({ queryKey: ["organization-settings", organizationId], queryFn: () => api.organizationSettings(organizationId), retry: false });
  const mutation = useMutation({
    mutationFn: (payload: SettingsPatch) => {
      if (!canEdit) throw new Error("Workspace settings are read-only for this role.");
      return api.updateOrganizationSettings(organizationId, payload);
    },
    onSuccess: (updated, submitted) => {
      const acknowledged = Object.fromEntries((Object.keys(submitted) as (keyof SettingsPatch)[])
        .map((field) => [field, updated[field]]));
      // A late full snapshot must not revert another section's newer save.
      client.setQueryData<typeof updated>(["organization-settings", organizationId], (current) =>
        current ? { ...current, ...acknowledged } : current);
      saved(organizationId, submitted);
      void client.invalidateQueries({ queryKey: ["organizations"] });
    }, retry: false,
  });
  if (query.isPending) return <PageLoading rows={3} />;
  if (query.error) return <PageError error={query.error} />;
  const data = query.data;
  const draft: SettingsDraft = { ...data, ...(canEdit ? drafts[organizationId] : {}) };
  const fields = policyFields[section];
  const changed = fields.some((field) => draft[field] !== data[field]);
  const saveLabel = { general: "Save general settings", data: "Save retention defaults", notifications: "Save notifications" }[section];
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (!canEdit || !changed || mutation.isPending || (section === "general" && draft.name.trim().length < 2)) return;
    // Only this section's fields cross the save boundary, never hidden drafts.
    mutation.mutate(Object.fromEntries(fields.filter((field) => draft[field] !== data[field]).map((field) => [field, draft[field]])) as SettingsPatch);
  }}>
    {!canEdit && <p className="settings-access-note">Read-only workspace policy. Owners and administrators manage these defaults.</p>}
    {section === "general" && <div className="settings-field"><label htmlFor="workspace-name">Workspace name</label><input className="input" id="workspace-name" value={draft.name} disabled={!canEdit} maxLength={255} onChange={(event) => edit(organizationId, { name: event.target.value })} /><p>Shown in the workspace switcher and exports.</p></div>}
    {section === "data" && <><div className="settings-field"><label htmlFor="retention-default">Default retention</label><AppSelect id="retention-default" value={String(draft.default_retention_days)} disabled={!canEdit} onValueChange={(value) => edit(organizationId, { default_retention_days: Number(value) as SettingsDraft["default_retention_days"] })} options={[7, 30, 90, 365].map((days) => ({ value: String(days), label: `${days} days` }))} /><p>Pre-fills new uploads. Reviewers can choose stricter source handling per contract.</p></div>
      <Toggle label="Retain original document by default" help="Needed for later source downloads and reprocessing." checked={draft.default_retain_document} disabled={!canEdit} onChange={(checked) => edit(organizationId, { default_retain_document: checked })} />
      <Toggle label="Retain extracted text by default" help="Required for evidence-linked contract Q&A after processing." checked={draft.default_retain_source_text} disabled={!canEdit} onChange={(checked) => edit(organizationId, { default_retain_source_text: checked })} />
      <p className="settings-access-note">These defaults do not extend existing retention deadlines. Contracts remain deletable at any time.</p></>}
    {section === "notifications" && <>
      <Toggle label="Review completed" help="Notify workspace members when a contract is ready." checked={draft.notification_review_ready} disabled={!canEdit} onChange={(checked) => edit(organizationId, { notification_review_ready: checked })} />
      <Toggle label="Review failed" help="Notify workspace members when processing needs attention." checked={draft.notification_review_failed} disabled={!canEdit} onChange={(checked) => edit(organizationId, { notification_review_failed: checked })} />
    </>}
    {canEdit && <div className="settings-save-row"><button className="button" type="submit" disabled={!changed || mutation.isPending || (section === "general" && draft.name.trim().length < 2)}>{mutation.isPending ? "Saving…" : saveLabel}</button><span>{changed ? "Unsaved changes in this section" : "No unsaved changes in this section"}</span></div>}
    {mutation.isSuccess && !changed && <p className="form-success" role="status">This section’s settings were saved.</p>}
    {mutation.error && <p className="form-error" role="alert">{mutation.error.message}</p>}
  </form>;
}

function Toggle({ label, help, checked, disabled, onChange }: { label: string; help: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="settings-choice"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span><strong>{label}</strong><small>{help}</small></span></label>;
}
