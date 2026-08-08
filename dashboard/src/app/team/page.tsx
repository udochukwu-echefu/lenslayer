"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MailPlus, ShieldCheck, Trash2, UserRound, UsersRound, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { PageError, PageLoading } from "@/components/page-states";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import type { InvitationCreated, Membership, Role } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/utils";

const roleNotes: Array<{ role: Role; summary: string }> = [
  { role: "owner", summary: "Controls ownership, administrators, and every workspace action." },
  { role: "admin", summary: "Manages reviewers and viewers, uploads reviews, and can delete contracts." },
  { role: "reviewer", summary: "Uploads contracts and inspects evidence-linked reviews." },
  { role: "viewer", summary: "Reads existing contracts and findings without changing workspace data." },
];

function MemberRow({ member, actorRole, actorId, organizationId }: { member: Membership; actorRole: Role | null; actorId?: string; organizationId: string }) {
  const queryClient = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const ownerActor = actorRole === "owner";
  const adminActor = actorRole === "admin";
  const manageable = ownerActor || (adminActor && ["reviewer", "viewer"].includes(member.role) && member.user_id !== actorId);
  const roles: Role[] = ownerActor ? ["owner", "admin", "reviewer", "viewer"] : ["reviewer", "viewer"];
  const roleMutation = useMutation({
    mutationFn: (role: Role) => api.updateMemberRole(organizationId, member.id, role),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["members", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["organizations"] }),
      ]);
    },
  });
  const removeMutation = useMutation({
    mutationFn: () => api.removeMember(organizationId, member.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members", organizationId] }),
  });

  return <div className="member-row">
    <span className="member-avatar"><UserRound size={16} /></span>
    <div className="member-identity"><strong>{member.display_name || member.email}</strong><span>{member.email}{member.user_id === actorId ? " · You" : ""}</span></div>
    <span className="member-since">Joined {formatDate(member.created_at)}</span>
    <div className="member-role">
      {manageable ? <AppSelect className="compact" value={member.role} ariaLabel={`Role for ${member.email}`} disabled={roleMutation.isPending} onValueChange={(role) => roleMutation.mutate(role as Role)} options={roles.map((role) => ({ value: role, label: titleCase(role) }))} /> : <span className="role-badge">{titleCase(member.role)}</span>}
    </div>
    <div className="member-action">{manageable && (confirmRemove ? <div className="inline-confirm"><button type="button" className="icon-button danger-icon" aria-label={`Confirm removal of ${member.email}`} onClick={() => removeMutation.mutate()} disabled={removeMutation.isPending}><Check size={16} /></button><button type="button" className="icon-button" aria-label="Cancel removal" onClick={() => setConfirmRemove(false)}><X size={16} /></button></div> : <button type="button" className="icon-button" aria-label={`Remove ${member.email}`} onClick={() => setConfirmRemove(true)}><Trash2 size={15} /></button>)}</div>
    {(roleMutation.error || removeMutation.error) && <p className="form-error member-error">{(roleMutation.error ?? removeMutation.error)?.message}</p>}
  </div>;
}

export default function TeamPage() {
  const { activeOrganization, activeRole, user, canManageTeam } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<InvitationCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const membersQuery = useQuery({ queryKey: ["members", organizationId], queryFn: () => api.members(organizationId), enabled: Boolean(organizationId) });
  const invitationsQuery = useQuery({ queryKey: ["invitations", organizationId], queryFn: () => api.invitations(organizationId), enabled: Boolean(organizationId && canManageTeam) });
  const pending = useMemo(() => (invitationsQuery.data ?? []).filter((item) => item.status === "pending"), [invitationsQuery.data]);
  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: Exclude<Role, "owner"> }) => api.createInvitation(organizationId, { email, role }),
    onSuccess: async (result) => { setCreated(result); setCopied(false); await queryClient.invalidateQueries({ queryKey: ["invitations", organizationId] }); },
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeInvitation(organizationId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invitations", organizationId] }),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreated(null);
    const form = new FormData(event.currentTarget);
    inviteMutation.mutate({ email: String(form.get("email") ?? ""), role: String(form.get("role") ?? "reviewer") as Exclude<Role, "owner"> });
  }

  async function copyLink() {
    if (!created) return;
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${created.token}`);
    setCopied(true);
  }

  if (membersQuery.isLoading) return <div className="page"><PageLoading rows={7} /></div>;
  if (membersQuery.error) return <div className="page"><PageError error={membersQuery.error} /></div>;

  return <div className="page team-page">
    <div className="page-heading"><div><p className="eyebrow">Access and accountability</p><h1 className="page-title">Team</h1><p className="page-description">Give each person only the authority their contract workflow requires. Every access change is written to the workspace audit record.</p></div><span className="team-count"><UsersRound size={16} />{membersQuery.data?.length ?? 0} members</span></div>

    <div className="team-overview">
      {canManageTeam ? <section className="invite-panel panel"><div className="team-section-head"><span><MailPlus size={18} /></span><div><h2>Invite a teammate</h2><p>The invitation expires after seven days and must be accepted using the invited email.</p></div></div><form onSubmit={submit} className="invite-form"><div className="field"><label htmlFor="invite-email">Work email</label><input className="input" id="invite-email" name="email" type="email" placeholder="name@company.com" required /></div><div className="field"><label htmlFor="invite-role">Starting role</label><AppSelect id="invite-role" name="role" defaultValue="reviewer" options={[...(activeRole === "owner" ? [{ value: "admin", label: "Administrator" }] : []), { value: "reviewer", label: "Reviewer" }, { value: "viewer", label: "Viewer" }]} /></div><button className="button" type="submit" disabled={inviteMutation.isPending}>{inviteMutation.isPending ? "Creating invitation…" : "Create secure invitation"}</button></form>{inviteMutation.error && <p className="form-error">{inviteMutation.error.message}</p>}{created && <div className="invite-result"><div><Check size={16} /><p><strong>Invitation ready</strong><span>Copy this link now. For security, the full link is shown only once.</span></p></div><button type="button" className="button secondary" onClick={copyLink}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}</button></div>}</section> : <section className="invite-panel panel read-only-team"><ShieldCheck size={20} /><div><p className="eyebrow">Your access</p><h2>{titleCase(activeRole ?? "viewer")}</h2><p>You can see who works in this workspace. Owners and administrators manage invitations and role changes.</p></div></section>}

      <section className="role-policy" aria-labelledby="role-policy-title"><div className="team-section-head"><span><ShieldCheck size={18} /></span><div><h2 id="role-policy-title">Four deliberate roles</h2><p>Authority expands only where the work requires it.</p></div></div><div className="role-lines">{roleNotes.map((item) => <div key={item.role}><strong>{titleCase(item.role)}</strong><p>{item.summary}</p>{item.role === activeRole && <span>You</span>}</div>)}</div></section>
    </div>

    <section className="team-register"><div className="section-heading"><h2>Workspace members</h2><p>Identity, role, and start date</p></div><div className="member-list">{(membersQuery.data ?? []).map((member) => <MemberRow key={member.id} member={member} actorRole={activeRole} actorId={user?.id} organizationId={organizationId} />)}</div></section>

    {canManageTeam && <section className="pending-invites"><div className="section-heading"><h2>Pending invitations</h2><p>{pending.length ? `${pending.length} awaiting acceptance` : "No outstanding invitations"}</p></div>{pending.length ? <div className="pending-list">{pending.map((invitation) => <div key={invitation.id}><div><strong>{invitation.email}</strong><span>{titleCase(invitation.role)} · Expires {formatDate(invitation.expires_at)}</span></div><button type="button" className="button ghost" onClick={() => revokeMutation.mutate(invitation.id)} disabled={revokeMutation.isPending}>Revoke</button></div>)}</div> : <div className="quiet-empty"><Check size={16} />All invitations are accounted for.</div>}{revokeMutation.error && <p className="form-error">{revokeMutation.error.message}</p>}</section>}
  </div>;
}
