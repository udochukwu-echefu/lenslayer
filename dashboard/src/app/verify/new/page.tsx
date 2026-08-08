"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Copy, FileLock2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { useWorkspace } from "@/components/workspace-provider";
import { api } from "@/lib/api";

type Mode = "upload" | "request";

export default function NewVerificationCasePage() {
  const { activeOrganization, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("upload");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reference, setReference] = useState("");
  const [priority, setPriority] = useState("normal");
  const [assignee, setAssignee] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [channel, setChannel] = useState<"secure_link" | "email" | "slack" | "telegram" | "whatsapp">("secure_link");
  const [createdUrl, setCreatedUrl] = useState("");
  const members = useQuery({ queryKey: ["members", organizationId], queryFn: () => api.members(organizationId), enabled: Boolean(organizationId) });
  const createCase = useMutation({
    mutationFn: () => {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      body.set("applicant_name", name);
      body.set("applicant_email", email);
      body.set("reference", reference);
      body.set("priority", priority);
      body.set("assigned_to_user_id", assignee);
      body.set("retention_days", "30");
      body.set("document_type", "supporting_document");
      return api.createVerificationCase(organizationId, body);
    },
    onSuccess: (created) => router.push(`/verify/${created.id}`),
  });
  const createLink = useMutation({
    mutationFn: () => api.createSecureIntakeLink(organizationId, {
      channel,
      recipient_name: name,
      recipient_email: email,
      applicant_name: name,
      message: "Please submit the onboarding documents requested for verification.",
      expires_in_days: 7,
      max_uploads: 5,
      retention_days: 30,
    }),
    onSuccess: (created) => setCreatedUrl(`${window.location.origin}/intake/${created.token}`),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "upload") createCase.mutate();
    else createLink.mutate();
  }

  if (!canUpload) return <div className="page"><div className="callout"><strong>Read-only access</strong><br />A reviewer, administrator, or owner must create onboarding cases.</div></div>;
  return <div className="page verification-intake-page"><Link className="back-link" href="/verify"><ArrowLeft size={15} />Verification queue</Link><div className="page-heading"><div><p className="eyebrow">Secure onboarding intake</p><h1 className="page-title">Open a verification case.</h1><p className="page-description">Upload evidence already in hand or issue a private expiring link through a trusted channel.</p></div></div><div className="intake-mode-tabs" role="tablist"><button type="button" role="tab" aria-selected={mode === "upload"} onClick={() => setMode("upload")}><UploadCloud size={16} />Direct upload</button><button type="button" role="tab" aria-selected={mode === "request"} onClick={() => setMode("request")}><FileLock2 size={16} />Secure request</button></div><form className="verification-intake-form" onSubmit={submit}><section><h2>Applicant</h2><div className="form-grid"><div className="field"><label htmlFor="applicant-name">Applicant or entity name</label><input id="applicant-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} required /></div><div className="field"><label htmlFor="applicant-email">Contact email</label><input id="applicant-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div></section>{mode === "upload" ? <><section><h2>Queue controls</h2><div className="form-grid"><div className="field"><label htmlFor="case-reference">Case reference</label><input id="case-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Generated when blank" /></div><div className="field"><label htmlFor="case-priority">Priority</label><AppSelect id="case-priority" value={priority} onValueChange={setPriority} options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }]} /></div><div className="field"><label htmlFor="case-assignee">Assign reviewer</label><AppSelect id="case-assignee" value={assignee} onValueChange={setAssignee} options={[{ value: "", label: "Unassigned" }, ...(members.data ?? []).filter((item) => item.role !== "viewer").map((item) => ({ value: item.user_id, label: item.display_name || item.email }))]} /></div></div></section><section><h2>Evidence</h2><label className="intake-drop internal"><UploadCloud size={24} /><strong>Select identity and onboarding files</strong><span>PDF, DOCX, or TXT · up to 25 MB each</span><input type="file" accept=".pdf,.docx,.txt" multiple required onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>{files.length > 0 && <div className="intake-file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small></span>)}</div>}</section></> : <section><h2>Delivery</h2><div className="form-grid"><div className="field"><label htmlFor="request-channel">Share through</label><AppSelect id="request-channel" value={channel} onValueChange={(value) => setChannel(value as typeof channel)} options={[{ value: "secure_link", label: "Copy secure link" }, { value: "email", label: "Email" }, { value: "slack", label: "Slack" }, { value: "telegram", label: "Telegram" }, { value: "whatsapp", label: "WhatsApp" }]} /></div></div>{createdUrl && <div className="secret-once"><strong>Private upload link</strong><code>{createdUrl}</code><button className="button secondary" type="button" onClick={() => navigator.clipboard.writeText(createdUrl)}><Copy size={14} />Copy link</button></div>}</section>}<div className="verification-intake-actions"><button className="button" type="submit" disabled={name.trim().length < 2 || (mode === "upload" && !files.length) || createCase.isPending || createLink.isPending}>{createCase.isPending || createLink.isPending ? "Creating…" : mode === "upload" ? "Create case" : "Create secure link"}<ArrowRight size={16} /></button>{(createCase.error || createLink.error) && <p className="form-error">{(createCase.error ?? createLink.error)?.message}</p>}</div></form></div>;
}
