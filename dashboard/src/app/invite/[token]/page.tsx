"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Clock3, ShieldCheck, UserCheck } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { api } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/utils";

export default function InvitationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { status: sessionStatus } = useSession();
  const queryClient = useQueryClient();
  const preview = useQuery({ queryKey: ["invitation", token], queryFn: () => api.invitation(token), retry: false });
  const accept = useMutation({ mutationFn: () => api.acceptInvitation(token), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organizations"] }) });

  const callbackUrl = `/invite/${encodeURIComponent(token)}`;

  return <main className="auth-page invite-page"><section className="auth-card invite-card"><BrandMark />{preview.isLoading ? <div className="invite-loading"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></div> : preview.error ? <div><p className="eyebrow">Invitation unavailable</p><h1>This link cannot be verified.</h1><p>{preview.error.message}</p><Link className="button secondary" href="/signin">Return to sign in</Link></div> : preview.data ? <><div><p className="eyebrow">Workspace invitation</p><h1>Join {preview.data.organization_name}.</h1><p>You have been invited as a <strong>{titleCase(preview.data.role)}</strong>. The invitation is bound to <strong>{preview.data.email_hint}</strong>.</p></div><div className="invite-facts"><p><ShieldCheck size={17} /><span><strong>Role</strong>{titleCase(preview.data.role)}</span></p><p><Clock3 size={17} /><span><strong>Expires</strong>{formatDate(preview.data.expires_at)}</span></p></div>{preview.data.status !== "pending" ? <div className="invite-status"><Check size={17} /><p>This invitation is {preview.data.status}.</p></div> : accept.data ? <div className="invite-accepted"><UserCheck size={20} /><div><strong>Access confirmed.</strong><p>Your {titleCase(accept.data.membership.role)} access is ready.</p></div><Link className="button" href="/">Open workspace<ArrowRight size={16} /></Link></div> : sessionStatus === "authenticated" ? <><button className="button" type="button" onClick={() => accept.mutate()} disabled={accept.isPending}>{accept.isPending ? "Accepting invitation..." : "Accept invitation"}<ArrowRight size={16} /></button>{accept.error && <p className="form-error">{accept.error.message}</p>}<p className="auth-note">Use the Auth0 account with the email address that received this invitation.</p></> : sessionStatus === "loading" ? <p className="auth-note">Checking your Auth0 session...</p> : <><div className="auth-actions"><Link className="button" href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Sign in to accept<ArrowRight size={16} /></Link><Link className="button secondary" href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Create account</Link></div><p className="auth-note">Sign in with the invited email address before accepting.</p></>}</> : null}</section></main>;
}
