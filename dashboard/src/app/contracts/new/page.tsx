"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Eye, FileText, ShieldCheck, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { useWorkspace } from "@/components/workspace-provider";
import { PageLoading } from "@/components/page-states";
import { api } from "@/lib/api";

const MAX_SIZE = 25 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];

export default function NewContractPage() {
  const { activeOrganization, canUpload } = useWorkspace();
  const queryClient = useQueryClient();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const mutation = useMutation({
    mutationFn: (form: FormData) => api.createContract(activeOrganization!.id, form),
    onSuccess: async ({ contract }) => {
      await queryClient.invalidateQueries({ queryKey: ["contracts", activeOrganization?.id] });
      router.push(`/contracts/${contract.id}`);
    },
  });
  const settingsQuery = useQuery({
    queryKey: ["organization-settings", activeOrganization?.id],
    queryFn: () => api.organizationSettings(activeOrganization!.id),
    enabled: Boolean(activeOrganization?.id),
  });

  if (!canUpload) return <div className="page"><Link className="back-link" href="/contracts"><ArrowLeft size={15} />Contracts</Link><div className="permission-state panel"><Eye size={22} /><p className="eyebrow">Read-only access</p><h1>Uploading is not part of your role.</h1><p>Viewers can inspect contracts and evidence already in the workspace. Ask an owner or administrator to change your role if you need to start reviews.</p><Link className="button secondary" href="/team">View team roles</Link></div></div>;
  if (settingsQuery.isLoading) return <div className="page"><PageLoading rows={8} /></div>;

  function choose(next: File | null) {
    setFileError("");
    if (!next) return;
    const extensionOk = /\.(pdf|docx|txt)$/i.test(next.name);
    if (!ACCEPTED.includes(next.type) && !extensionOk) return setFileError("Use a PDF, DOCX, or TXT document."), setFile(null);
    if (next.size > MAX_SIZE) return setFileError("The document must be 25 MB or smaller."), setFile(null);
    setFile(next);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setFileError("Choose a contract to continue.");
    const form = new FormData(event.currentTarget);
    form.set("file", file);
    mutation.mutate(form);
  }

  return <div className="page upload-page">
    <Link className="back-link" href="/contracts"><ArrowLeft size={15} />Contracts</Link>
    <div className="page-heading upload-heading"><div><p className="eyebrow">New review</p><h1 className="page-title">Upload a contract.</h1><p className="page-description">Set the review perspective before analysis. Context changes what Lenslayer prioritises — it does not change the source evidence.</p></div></div>
    <form className="upload-layout" onSubmit={submit}>
      <div className="upload-main">
        <section className="form-section"><div className="form-section-number">01</div><div className="form-section-body"><div className="form-section-head"><h2>Choose the agreement</h2><p>One original document per review.</p></div>
          <div className={`dropzone ${file ? "has-file" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}>
            <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" hidden onChange={(event) => choose(event.target.files?.[0] ?? null)} />
            {file ? <><span className="drop-icon"><FileText size={22} /></span><div><strong>{file.name}</strong><p>{(file.size / 1024 / 1024).toFixed(file.size > 1024 * 1024 ? 1 : 2)} MB · Ready to upload</p></div><button type="button" className="icon-button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} aria-label="Remove document"><X size={18} /></button></> : <><span className="drop-icon"><UploadCloud size={22} /></span><div><strong>Drop the document here</strong><p>PDF, DOCX, or TXT · up to 25 MB</p></div><button type="button" className="button secondary" onClick={() => inputRef.current?.click()}>Choose file</button></>}
          </div>{fileError && <p className="form-error" role="alert">{fileError}</p>}
        </div></section>

        <section className="form-section"><div className="form-section-number">02</div><div className="form-section-body"><div className="form-section-head"><h2>Describe the deal</h2><p>Optional details make the contract register easier to scan.</p></div><div className="form-grid">
          <div className="field full"><label htmlFor="title">Contract title</label><input className="input" id="title" name="title" placeholder="e.g. Acme software services agreement" /></div>
          <div className="field"><label htmlFor="counterparty">Counterparty</label><input className="input" id="counterparty" name="counterparty" placeholder="e.g. Acme Ltd" /></div>
          <div className="field"><label htmlFor="contract_type">Contract type</label><AppSelect id="contract_type" name="contract_type" defaultValue="Unknown" options={["Unknown", "Services", "Employment", "Lease", "NDA", "Supplier", "Loan", "Partnership", "Other"].map((value) => ({ value, label: value }))} /></div>
        </div></div></section>

        <section className="form-section"><div className="form-section-number">03</div><div className="form-section-body"><div className="form-section-head"><h2>Set the review context</h2><p>Tell Lenslayer whose decisions it should help prepare.</p></div><div className="form-grid">
          <div className="field"><label htmlFor="party_role">You are reviewing for</label><AppSelect id="party_role" name="party_role" defaultValue="Not sure / general review" options={["Not sure / general review", "Customer / buyer", "Vendor / supplier", "Employer", "Employee / contractor", "Landlord", "Tenant", "Borrower", "Lender"].map((value) => ({ value, label: value }))} /></div>
          <div className="field"><label htmlFor="jurisdiction">Jurisdiction or governing law</label><input className="input" id="jurisdiction" name="jurisdiction" placeholder="e.g. Lagos State, Nigeria" /></div>
          <div className="field"><label htmlFor="goal">Primary goal</label><AppSelect id="goal" name="goal" defaultValue="Understand before signing" options={["Understand before signing", "Prepare to negotiate", "Check an existing agreement", "Summarise obligations", "Compare with our position"].map((value) => ({ value, label: value }))} /></div>
          <div className="field"><label htmlFor="risk_tolerance">Risk posture</label><AppSelect id="risk_tolerance" name="risk_tolerance" defaultValue="Balanced" options={["Conservative", "Balanced", "Commercially flexible"].map((value) => ({ value, label: value }))} /></div>
        </div></div></section>

        <section className="form-section"><div className="form-section-number">04</div><div className="form-section-body"><div className="form-section-head"><h2>Choose data handling</h2><p>Keep only what your workflow needs.</p></div><div className="retention-options">
          <label className="check-row"><input type="checkbox" name="retain_document" value="true" defaultChecked={settingsQuery.data?.default_retain_document} /><span><strong>Retain original document</strong><small>Keep the uploaded file for later evidence access.</small></span></label>
          <label className="check-row"><input type="checkbox" name="retain_source_text" value="true" defaultChecked={settingsQuery.data?.default_retain_source_text} /><span><strong>Retain extracted source text</strong><small>Required for evidence-linked Q&amp;A after processing.</small></span></label>
          <div className="field retention-days"><label htmlFor="retention_days">Retention period</label><AppSelect id="retention_days" name="retention_days" defaultValue={String(settingsQuery.data?.default_retention_days ?? 30)} options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "365", label: "1 year" }]} /></div>
        </div><label className="consent-row"><input type="checkbox" required /><span>I confirm I am authorised to process this document.</span></label></div></section>
      </div>
      <aside className="upload-summary panel"><p className="eyebrow">What happens next</p><ol><li><span><Check size={14} /></span><div><strong>Private upload</strong><p>The file travels through the workspace server, not directly from your browser to an AI provider.</p></div></li><li><span>2</span><div><strong>Evidence-led analysis</strong><p>Lenslayer extracts terms, risks, obligations, and uncertainties.</p></div></li><li><span>3</span><div><strong>Human decision</strong><p>You inspect source-linked findings and decide what to accept, change, or escalate.</p></div></li></ol><div className="honest-limit"><ShieldCheck size={17} /><p><strong>Honest limit</strong><br />Lenslayer supports first-pass review. It does not provide legal advice.</p></div><button className="button submit-review" type="submit" disabled={mutation.isPending || !file}>{mutation.isPending ? "Starting review…" : "Start review"}<ArrowRight size={16} /></button>{mutation.error && <p className="form-error" role="alert">{mutation.error.message}</p>}</aside>
    </form>
  </div>;
}
