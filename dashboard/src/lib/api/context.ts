import type { ContextRecord, ContextRecordCreate, ContextVersion, ContextVersionCreate } from "../agent-types";
import { isDemoWorkspace } from "../workspace-mode";
import { ApiError, jsonRequest, request } from "./client";

const base = (org: string) => `/organizations/${encodeURIComponent(org)}/context-records`;
const recordPath = (org: string, record: string) => `${base(org)}/${encodeURIComponent(record)}`;
const previewCreatedAt = new Date().toISOString();
export const syntheticContext: ContextRecord = { id: "synthetic-onboarding", organization_id: "public-workspace", title: "Relay Software support handoff", current_version: 1, expires_at: new Date(Date.parse(previewCreatedAt) + 30 * 86400000).toISOString(), deleted_at: null, created_at: previewCreatedAt };
const syntheticVersion: ContextVersion = { id: "synthetic-context-version", record_id: syntheticContext.id, version_number: 1, source_sha256: "f43d37349e32a622cf954866ee90b0b7353d1c0d3d56da867bddfeaa00558950", text: "Synthetic example only. Relay Software: assign a support owner before handing the customer account to operations.", created_at: syntheticContext.created_at };
function privateOnly(org: string) { if (isDemoWorkspace(org)) throw new ApiError("Synthetic workspace context is read-only.", 403); }
export const contextApi = {
  contextRecords: (org: string, signal?: AbortSignal) => isDemoWorkspace(org) ? Promise.resolve([syntheticContext]) : request<ContextRecord[]>(`${base(org)}?limit=50`, { signal }, false),
  contextRecord: (org: string, id: string, signal?: AbortSignal) => {
    if (isDemoWorkspace(org)) return id === syntheticContext.id ? Promise.resolve(syntheticContext) : Promise.reject(new ApiError("Context unavailable", 404));
    return request<ContextRecord>(recordPath(org, id), { signal }, false);
  },
  contextVersion: (org: string, id: string, version: number, signal?: AbortSignal) => {
    if (!Number.isSafeInteger(version) || version < 1) throw new ApiError("Choose a positive version number.", 422);
    if (isDemoWorkspace(org)) return id === syntheticContext.id && version === 1 ? Promise.resolve(syntheticVersion) : Promise.reject(new ApiError("Context version unavailable", 404));
    return request<ContextVersion>(`${recordPath(org, id)}/versions/${version}`, { signal }, false);
  },
  createContextRecord: (org: string, input: ContextRecordCreate, signal?: AbortSignal) => { privateOnly(org); return jsonRequest<ContextRecord>(base(org), "POST", input, false, signal); },
  createContextVersion: (org: string, id: string, input: ContextVersionCreate, signal?: AbortSignal) => { privateOnly(org); return jsonRequest<ContextRecord>(`${recordPath(org, id)}/versions`, "POST", input, false, signal); },
  deleteContextRecord: (org: string, id: string, signal?: AbortSignal) => { privateOnly(org); return request<void>(recordPath(org, id), { method: "DELETE", signal }, false); },
};
