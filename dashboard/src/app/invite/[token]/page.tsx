"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Clock3, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/utils";

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { user } = useWorkspace();
  const queryClient = useQueryClient();
  const preview = useQuery({ queryKey: ["invitation", token], queryFn: () => api.invitation(token), retry: false });
  const accept = useMutation({ mutationFn: () => api.acceptInvitation(token), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations"] }) });

  return <main className="auth-page invite-page"><section className="auth-card invite-card"><BrandMark />{preview.isLoading ? <div className="invite-loading"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div> : preview.error ? <div><p className="eyebrow">Invitation unavailable</p><h1>This link cannot be verified.</h1><p>{preview.error.message}</p><Link className="button secondary" href="/">Open public workspace</Link></div> : preview.data ? <><div><p className="eyebrow">Workspace invitation</p><h1>Join {preview.data.organization_name}.</h1><p>You have been invited as a <strong>{titleCase(preview.data.role)}</strong>. The invitation is bound to <strong>{preview.data.email_hint}</strong>.</p></div><div className="invite-facts"><p><ShieldCheck size={17} /><span><strong>Role</strong>{titleCase(preview.data.role)}</span></p><p><Clock3 size={17} /><span><strong>Expires</strong>{formatDate(preview.data.expires_at)}</span></p></div>{preview.data.status !== "pending" ? <div className="invite-status"><Check size={17} /><p>This invitation is {preview.data.status}.</p></div> : accept.data ? <div className="invite-accepted"><UserCheck size={20} /><div><strong>You’re in.</strong><p>Your {titleCase(accept.data.membership.role)} access is ready.</p></div><Link className="button" href="/">Open workspace<ArrowRight size={16} /></Link></div> : user ? <><button className="button" type="button" onClick={() => accept.mutate()} disabled={accept.isPending}>{accept.isPending ? "Accepting invitation…" : "Accept invitation"}<ArrowRight size={16} /></button>{accept.error && <p className="form-error">{accept.error.message}</p>}<p className="auth-note">Invitation acceptance is unavailable while the workspace is public.</p></> : <><Link className="button" href="/">Open public workspace<ArrowRight size={16} /></Link><p className="auth-note">Account access will return when authentication is restored.</p></>}</> : null}</section></main>;
}
