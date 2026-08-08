"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileLock2, LoaderCircle, UploadCloud } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { AppSelect } from "./app-select";
import { BrandMark } from "./brand-mark";

export function SecureIntakeUpload({ token }: { token: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState("supporting_document");
  const preview = useQuery({ queryKey: ["secure-intake", token], queryFn: () => api.secureIntakePreview(token) });
  const upload = useMutation({
    mutationFn: () => {
      const body = new FormData();
      files.forEach((file) => body.append("files", file));
      body.set("document_type", documentType);
      return api.uploadSecureIntakeDocuments(token, body);
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length) upload.mutate();
  }

  if (preview.isLoading) return <main className="auth-page"><LoaderCircle className="gate-spinner" aria-label="Verifying secure link" /></main>;
  if (preview.error || !preview.data) return <main className="auth-page"><section className="auth-card"><BrandMark /><div><p className="eyebrow">Link unavailable</p><h1>This upload link cannot be verified.</h1><p>The link may have expired, been revoked, or already reached its upload limit. Contact the organization that requested your documents.</p></div></section></main>;
  const item = preview.data;
  if (upload.data) return <main className="auth-page"><section className="auth-card intake-success"><BrandMark /><span className="auth-state-icon good"><CheckCircle2 size={22} /></span><div><p className="eyebrow">Documents received</p><h1>Your files are in the review queue.</h1><p>{upload.data.documents.length} document{upload.data.documents.length === 1 ? "" : "s"} received under case {upload.data.verification_case.reference}. You can close this window.</p></div></section></main>;
  const inactive = item.status !== "active";
  return <main className="auth-page secure-intake-page"><form className="auth-card secure-intake-card" onSubmit={submit}><BrandMark /><div><p className="eyebrow">Secure onboarding · {item.organization_name}</p><h1>Submit documents for {item.applicant_name}.</h1><p>{item.message || "Upload the identity and onboarding evidence requested by the reviewing organization."}</p></div><div className="intake-security-note"><FileLock2 size={18} /><p>Files use a private, expiring upload path. This page cannot access the organization&apos;s workspace or review decision.</p></div>{inactive ? <p className="auth-alert">This link is {item.status} and cannot accept more files.</p> : <><label className="intake-drop"><UploadCloud size={24} /><strong>Choose onboarding documents</strong><span>PDF, DOCX, or TXT · up to 25 MB each · {item.remaining_uploads} remaining</span><input type="file" accept=".pdf,.docx,.txt" multiple required onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>{files.length > 0 && <div className="intake-file-list">{files.map((file) => <span key={`${file.name}-${file.size}`}><strong>{file.name}</strong><small>{Math.ceil(file.size / 1024)} KB</small></span>)}</div>}<div className="field"><label htmlFor="document-type">Document type</label><AppSelect id="document-type" value={documentType} onValueChange={setDocumentType} options={[{ value: "identity_document", label: "Identity document" }, { value: "proof_of_address", label: "Proof of address" }, { value: "company_document", label: "Company document" }, { value: "supporting_document", label: "Other supporting document" }]} /></div><button className="button" type="submit" disabled={!files.length || files.length > item.remaining_uploads || upload.isPending}>{upload.isPending ? "Encrypting and uploading…" : "Submit documents"}<UploadCloud size={16} /></button>{upload.error && <p className="form-error" role="alert">{upload.error.message}</p>}</>}<p className="auth-note">Link expires {formatDate(item.expires_at)}. Do not forward it to another person.</p></form></main>;
}
