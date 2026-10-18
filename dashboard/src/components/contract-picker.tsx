"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { request } from "@/lib/api/client";
import type { Contract } from "@/lib/types";
import { useDebouncedValue } from "@/lib/workspace-query-hooks";
import { AppSelect } from "./app-select";
import { QueryPagination } from "./ui/query-pagination";

type Props = {
  organizationId: string; id: string; name: string; defaultValue?: string; multiple?: boolean;
  required?: boolean; retainedOnly?: boolean; privateWorkspace?: boolean;
  eligible?: (contract: Contract) => boolean; onSelectionChange?: (contracts: Contract[]) => void;
  onAvailabilityChange?: (availability: { pending: boolean; error: Error | null }) => void;
};

export function ContractPicker(props: Props) {
  return <ScopedContractPicker key={`${props.organizationId}-${Boolean(props.privateWorkspace)}`} {...props} />;
}

function ScopedContractPicker({ organizationId, id, name, defaultValue = "", multiple = false, required = false, retainedOnly = false, privateWorkspace = false, eligible, onSelectionChange, onAvailabilityChange }: Props) {
  const [term, setTerm] = useState("");
  const q = useDebouncedValue(term.trim());
  const [page, setPage] = useState({ q, offset: 0 });
  const offset = page.q === q ? page.offset : 0;
  const [selected, setSelected] = useState<Contract[]>([]);
  const [value, setValue] = useState(defaultValue);
  const filters = { q, offset, limit: 25, sort: "title" as const, descending: false };
  const query = useQuery({ queryKey: ["contracts", organizationId, "choices", privateWorkspace, filters], queryFn: ({ signal }) => api.queryContracts(organizationId, filters, { signal, privateWorkspace }), enabled: Boolean(organizationId), retry: false });
  // Explicit initial selection must remain selectable even when it is older than page one.
  const initial = useQuery({ queryKey: ["contracts", organizationId, "choice", privateWorkspace, defaultValue], queryFn: ({ signal }) => request<Contract>(`/organizations/${encodeURIComponent(organizationId)}/contracts/${encodeURIComponent(defaultValue)}`, { signal }, privateWorkspace ? false : undefined, privateWorkspace ? "fresh" : undefined), enabled: Boolean(organizationId && defaultValue), retry: false });
  const allowed = (contract: Contract) => (!retainedOnly || contract.retain_source_text) && (!eligible || eligible(contract));
  const rows = [...new Map([...(query.data?.items ?? []), ...(initial.data ? [initial.data] : []), ...selected].filter((item) => item.organization_id === organizationId).map((item) => [item.id, item])).values()];
  const error = query.error ?? initial.error;
  const pending = query.isPending || Boolean(defaultValue && initial.isPending);
  useEffect(() => { onAvailabilityChange?.({ pending, error }); }, [onAvailabilityChange, pending, error]);
  function select(ids: string[]) {
    const next = rows.filter((row) => ids.includes(row.id) && allowed(row));
    setSelected(next); setValue(ids[0] ?? ""); onSelectionChange?.(next);
  }
  return <><input className="input" type="search" value={term} maxLength={200} onChange={(event) => setTerm(event.target.value)} placeholder="Search contracts" aria-label={`Search ${multiple ? "retained contracts" : "contract choices"}`} />
    {query.isPending && <p role="status" className="field-help">Loading contract choices…</p>}
    {error && <p role="alert" className="form-error">Contract choices could not load: {error.message} <button type="button" onClick={() => { void query.refetch(); if (defaultValue) void initial.refetch(); }}>Try again</button></p>}
    {multiple ? rows.filter(allowed).map((contract) => <label key={contract.id}><input type="checkbox" name={name} value={contract.id} checked={selected.some((item) => item.id === contract.id)} onChange={(event) => select(event.target.checked ? [...selected.map((item) => item.id), contract.id] : selected.filter((item) => item.id !== contract.id).map((item) => item.id))} /><span>{contract.title || contract.source_name}<small>{contract.id}</small></span></label>) : <AppSelect id={id} name={name} required={required} value={value} onValueChange={(id) => select(id ? [id] : [])} options={[{ value: "", label: required ? "Select a retained source" : "No contract", disabled: required }, ...rows.map((contract) => ({ value: contract.id, label: `${contract.title || contract.source_name}${!allowed(contract) ? " — source unavailable or expired" : ""}`, disabled: !allowed(contract) }))]} />}
    {query.data && <QueryPagination total={query.data.total} offset={offset} limit={25} onOffsetChange={(offset) => setPage({ q, offset })} label="Contract choices" />}
    {query.data && !query.data.items.some(allowed) && <p className="field-help">No matching contracts on this page. Search or change pages to find an older record.</p>}
    {query.data && !query.data.items.some(allowed) && (retainedOnly ? <p>Upload a contract with source-text retention enabled before delegating this workflow.</p> : eligible ? <p className="field-help"><Link href="/contracts/new">Upload a source with text retention</Link> before assigning.</p> : null)}
  </>;
}
