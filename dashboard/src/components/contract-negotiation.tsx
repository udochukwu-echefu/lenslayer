"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileClock, FileUp, ListChecks, MessageSquareReply, Plus, XCircle } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { NegotiationItem, NegotiationItemCategory, NegotiationItemStatus } from "@/lib/types";
import { asText, formatDate, formatRelativeDate, titleCase } from "@/lib/utils";
import { AppSelect } from "./app-select";
import { PageError, PageLoading } from "./page-states";
import { useWorkspace } from "./workspace-provider";

const categoryOptions: NegotiationItemCategory[] = ["change", "commercial", "legal", "operational", "open_point"];

function statusTone(status: NegotiationItemStatus) {
  if (status === "accepted" || status === "resolved") return "low";
  if (status === "rejected") return "high";
  return "medium";
}

function ChecklistItem({ item, organizationId, contractId }: { item: NegotiationItem; organizationId: string; contractId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: NegotiationItemStatus) => api.updateNegotiationItem(organizationId, contractId, item.id, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["negotiation-items", organizationId, contractId] });
      await queryClient.invalidateQueries({ queryKey: ["negotiation-summary", organizationId, contractId] });
    },
  });
  return <article className="negotiation-item">
    <div>
      <strong>{item.title}</strong>
      <span className={`pill ${statusTone(item.status)}`}>{titleCase(item.status)}</span>
    </div>
    {item.description && <p>{item.description}</p>}
    <dl>
      <div><dt>Category</dt><dd>{titleCase(item.category)}</dd></div>
      <div><dt>Priority</dt><dd>{titleCase(item.priority)}</dd></div>
      {item.our_position && <div><dt>Our position</dt><dd>{item.our_position}</dd></div>}
      {item.counterparty_position && <div><dt>Counterparty</dt><dd>{item.counterparty_position}</dd></div>}
    </dl>
    <footer>
      <small>{item.created_by_name || "Reviewer"} · {formatRelativeDate(item.created_at)}</small>
      <div>
        <button disabled={mutation.isPending} onClick={() => mutation.mutate("accepted")}><CheckCircle2 size={13} />Accept</button>
        <button disabled={mutation.isPending} onClick={() => mutation.mutate("rejected")}><XCircle size={13} />Reject</button>
        <button disabled={mutation.isPending} onClick={() => mutation.mutate("unresolved")}>Unresolved</button>
      </div>
    </footer>
  </article>;
}

export function ContractNegotiation({ contractId }: { contractId: string }) {
  const { activeOrganization, canUpload } = useWorkspace();
  const organizationId = activeOrganization?.id ?? "";
  const queryClient = useQueryClient();
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [revisionLabel, setRevisionLabel] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [itemTitle, setItemTitle] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemCategory, setItemCategory] = useState<NegotiationItemCategory>("change");
  const [itemPriority, setItemPriority] = useState<"low" | "normal" | "high">("normal");
  const [ourPosition, setOurPosition] = useState("");
  const [counterpartyPosition, setCounterpartyPosition] = useState("");
  const [responderName, setResponderName] = useState("");
  const [responseBody, setResponseBody] = useState("");
  const [responseVersionId, setResponseVersionId] = useState("");
  const [relatedItems, setRelatedItems] = useState<string[]>([]);

  const versionsQuery = useQuery({ queryKey: ["versions", organizationId, contractId], queryFn: () => api.versions(organizationId, contractId), enabled: Boolean(organizationId) });
  const itemsQuery = useQuery({ queryKey: ["negotiation-items", organizationId, contractId], queryFn: () => api.negotiationItems(organizationId, contractId), enabled: Boolean(organizationId) });
  const responsesQuery = useQuery({ queryKey: ["counterparty-responses", organizationId, contractId], queryFn: () => api.counterpartyResponses(organizationId, contractId), enabled: Boolean(organizationId) });
  const summaryQuery = useQuery({ queryKey: ["negotiation-summary", organizationId, contractId], queryFn: () => api.negotiationSummary(organizationId, contractId), enabled: Boolean(organizationId) });

  const uploadMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (revisionFile) form.append("file", revisionFile);
      form.append("label", revisionLabel);
      form.append("notes", revisionNotes);
      return api.uploadVersion(organizationId, contractId, form);
    },
    onSuccess: async () => {
      setRevisionFile(null);
      setRevisionLabel("");
      setRevisionNotes("");
      await queryClient.invalidateQueries({ queryKey: ["versions", organizationId, contractId] });
      await queryClient.invalidateQueries({ queryKey: ["negotiation-summary", organizationId, contractId] });
    },
  });
  const itemMutation = useMutation({
    mutationFn: () => api.createNegotiationItem(organizationId, contractId, { title: itemTitle, description: itemDescription, category: itemCategory, priority: itemPriority, our_position: ourPosition, counterparty_position: counterpartyPosition }),
    onSuccess: async () => {
      setItemTitle("");
      setItemDescription("");
      setOurPosition("");
      setCounterpartyPosition("");
      await queryClient.invalidateQueries({ queryKey: ["negotiation-items", organizationId, contractId] });
      await queryClient.invalidateQueries({ queryKey: ["negotiation-summary", organizationId, contractId] });
    },
  });
  const responseMutation = useMutation({
    mutationFn: () => api.createCounterpartyResponse(organizationId, contractId, { responder_name: responderName, channel: "email", body: responseBody, contract_version_id: responseVersionId || null, related_item_ids: relatedItems }),
    onSuccess: async () => {
      setResponderName("");
      setResponseBody("");
      setRelatedItems([]);
      await queryClient.invalidateQueries({ queryKey: ["counterparty-responses", organizationId, contractId] });
      await queryClient.invalidateQueries({ queryKey: ["negotiation-summary", organizationId, contractId] });
    },
  });

  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data]);
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const groupedCounts = useMemo(() => ({
    accepted: items.filter((item) => item.status === "accepted").length,
    rejected: items.filter((item) => item.status === "rejected").length,
    unresolved: items.filter((item) => item.status === "proposed" || item.status === "unresolved").length,
  }), [items]);
  const loading = versionsQuery.isLoading || itemsQuery.isLoading || responsesQuery.isLoading || summaryQuery.isLoading;
  const error = versionsQuery.error || itemsQuery.error || responsesQuery.error || summaryQuery.error;
  if (loading) return <PageLoading rows={8} />;
  if (error) return <PageError error={error} />;

  return <section className="negotiation-workspace">
    <div className="content-heading"><div><p className="eyebrow">Negotiation record</p><h2>Versions, responses, and outcomes</h2></div><p>Track revised documents, counterparty positions, accepted changes, rejected changes, and unresolved points.</p></div>
    <div className="negotiation-signals">
      <div><span>Versions</span><strong>{versions.length}</strong></div>
      <div><span>Accepted</span><strong>{groupedCounts.accepted}</strong></div>
      <div><span>Rejected</span><strong>{groupedCounts.rejected}</strong></div>
      <div><span>Unresolved</span><strong>{groupedCounts.unresolved}</strong></div>
    </div>
    {summaryQuery.data && <div className="negotiation-summary"><FileClock size={18} /><p>{summaryQuery.data.final_summary}</p></div>}

    <div className="negotiation-grid">
      <section className="workflow-section">
        <header><div><FileUp size={17} /><h3>Version history</h3></div><span>{versions.length}</span></header>
        {canUpload && <form className="revision-form" onSubmit={(event: FormEvent) => { event.preventDefault(); if (revisionFile) uploadMutation.mutate(); }}>
          <input type="file" accept=".pdf,.docx,.txt" onChange={(event) => setRevisionFile(event.target.files?.[0] ?? null)} aria-label="Revised document" />
          <input value={revisionLabel} onChange={(event) => setRevisionLabel(event.target.value)} placeholder="Version label" />
          <textarea value={revisionNotes} onChange={(event) => setRevisionNotes(event.target.value)} placeholder="Notes from this exchange" />
          <button className="button" disabled={!revisionFile || uploadMutation.isPending}><FileUp size={14} />Upload revision</button>
          {uploadMutation.error && <p className="form-error">{uploadMutation.error.message}</p>}
        </form>}
        <div className="version-list">{versions.map((version) => <article key={version.id}>
          <div><strong>v{version.version_number} · {version.label || version.source_name}</strong><time>{formatDate(version.created_at)}</time></div>
          <p>{version.comparison.changed_summary}</p>
          {version.notes && <small>{version.notes}</small>}
          {(version.comparison.added.length > 0 || version.comparison.removed.length > 0) && <div className="comparison-columns">
            <div><span>Added</span>{version.comparison.added.slice(0, 4).map((line) => <p key={line}>{line}</p>)}</div>
            <div><span>Removed</span>{version.comparison.removed.slice(0, 4).map((line) => <p key={line}>{line}</p>)}</div>
          </div>}
        </article>)}</div>
      </section>

      <section className="workflow-section">
        <header><div><ListChecks size={17} /><h3>Checklist</h3></div><span>{items.length}</span></header>
        {canUpload && <form className="negotiation-item-form" onSubmit={(event) => { event.preventDefault(); if (itemTitle.trim().length >= 2) itemMutation.mutate(); }}>
          <input value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} placeholder="Negotiation point" />
          <div><AppSelect value={itemCategory} ariaLabel="Negotiation point category" onValueChange={(value) => setItemCategory(value as NegotiationItemCategory)} options={categoryOptions.map((category) => ({ value: category, label: titleCase(category) }))} /><AppSelect value={itemPriority} ariaLabel="Negotiation point priority" onValueChange={(value) => setItemPriority(value as "low" | "normal" | "high")} options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }]} /></div>
          <textarea value={itemDescription} onChange={(event) => setItemDescription(event.target.value)} placeholder="Evidence, ask, or fallback" />
          <div><input value={ourPosition} onChange={(event) => setOurPosition(event.target.value)} placeholder="Our position" /><input value={counterpartyPosition} onChange={(event) => setCounterpartyPosition(event.target.value)} placeholder="Counterparty position" /></div>
          <button className="button secondary" disabled={itemTitle.trim().length < 2 || itemMutation.isPending}><Plus size={14} />Add point</button>
          {itemMutation.error && <p className="form-error">{itemMutation.error.message}</p>}
        </form>}
        <div className="negotiation-item-list">{items.length ? items.map((item) => <ChecklistItem key={item.id} item={item} organizationId={organizationId} contractId={contractId} />) : <div className="quiet-panel"><CheckCircle2 size={18} /><p>No negotiation points have been recorded.</p></div>}</div>
      </section>

      <section className="workflow-section responses-section">
        <header><div><MessageSquareReply size={17} /><h3>Counterparty responses</h3></div><span>{responsesQuery.data?.length ?? 0}</span></header>
        {canUpload && <form className="counterparty-form" onSubmit={(event) => { event.preventDefault(); if (responseBody.trim().length >= 2) responseMutation.mutate(); }}>
          <div><input value={responderName} onChange={(event) => setResponderName(event.target.value)} placeholder="Responder" /><AppSelect value={responseVersionId} ariaLabel="Related contract version" onValueChange={setResponseVersionId} options={[{ value: "", label: "No version" }, ...versions.map((version) => ({ value: version.id, label: `v${version.version_number} · ${version.label || version.source_name}` }))]} /></div>
          <textarea value={responseBody} onChange={(event) => setResponseBody(event.target.value)} placeholder="Counterparty response" />
          <div className="related-picker">{items.map((item) => <label key={item.id}><input type="checkbox" checked={relatedItems.includes(item.id)} onChange={(event) => setRelatedItems(event.target.checked ? [...relatedItems, item.id] : relatedItems.filter((id) => id !== item.id))} />{item.title}</label>)}</div>
          <button className="button secondary" disabled={responseBody.trim().length < 2 || responseMutation.isPending}><MessageSquareReply size={14} />Record response</button>
          {responseMutation.error && <p className="form-error">{responseMutation.error.message}</p>}
        </form>}
        <div className="response-list">{responsesQuery.data?.map((response) => <article key={response.id}><div><strong>{response.responder_name || "Counterparty"}</strong><time>{formatRelativeDate(response.created_at)}</time></div><p>{response.body}</p><small>{titleCase(response.channel)}{response.contract_version_id ? ` · ${asText(versions.find((version) => version.id === response.contract_version_id)?.label, "Version response")}` : ""}{response.related_item_ids.length ? ` · ${response.related_item_ids.length} linked points` : ""}</small></article>)}</div>
      </section>
    </div>
  </section>;
}
