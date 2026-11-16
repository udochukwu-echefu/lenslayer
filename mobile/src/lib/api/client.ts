import { config } from "../config";

/**
 * One HTTP transport for every domain client. The app talks to the FastAPI
 * service directly (there is no BFF on mobile), so the auth layer registers a
 * header provider: an OIDC bearer token, or the local development identity.
 */
export type AuthHeaders = () => Promise<Record<string, string> | null>;

let authHeaders: AuthHeaders = async () => null;
let onUnauthorized: () => void = () => {};

export function configureTransport(options: { headers: AuthHeaders; onUnauthorized: () => void }) {
  authHeaders = options.headers;
  onUnauthorized = options.onUnauthorized;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public detail?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

/** Mirrors dashboard/src/lib/api/client.ts so error copy matches the web workspace. */
export function errorMessage(detail: unknown, status: number): string {
  const value = typeof detail === "object" && detail && "detail" in detail ? (detail as { detail: unknown }).detail : detail;
  if (typeof value === "string" && value.trim() && !value.trim().startsWith("<")) return value;
  if (Array.isArray(value)) {
    const messages = value.flatMap((issue: unknown) => {
      if (!issue || typeof issue !== "object" || !("msg" in issue) || typeof issue.msg !== "string") return [];
      const location = "loc" in issue && Array.isArray(issue.loc)
        ? issue.loc.filter((part) => !["body", "query", "path"].includes(String(part))).join(".")
        : "";
      return [location ? `${location}: ${issue.msg}` : issue.msg];
    });
    if (messages.length) return messages.join("; ");
  }
  if (status === 0) return "The LensLayer API is unavailable. Check your connection and try again.";
  return `Request failed (${status})`;
}

/** Public, anonymous routes that never need a session. */
const isPublicPath = (method: string, path: string) => method === "GET" && /^\/(?:invitations|shared)\/[^/?]+$/.test(path);

export async function buildHeaders(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const method = init?.method?.toUpperCase() ?? "GET";
  if (!isPublicPath(method, path)) {
    const auth = await authHeaders();
    if (!auth) throw new ApiError("Sign in to continue.", 401);
    for (const [name, value] of Object.entries(auth)) headers.set(name, value);
  }
  return headers;
}

export async function failure(response: Response, path: string, method = "GET"): Promise<ApiError> {
  if (response.status === 401 && !isPublicPath(method, path)) onUnauthorized();
  const body = await response.text().catch(() => "");
  let detail: unknown = body;
  try { detail = JSON.parse(body); } catch { /* keep plain-text upstream errors */ }
  return new ApiError(errorMessage(detail, response.status), response.status, detail);
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await buildHeaders(path, init);
  init?.signal?.throwIfAborted();
  let response: Response;
  try {
    response = await fetch(`${config.apiPrefix}${path}`, { ...init, headers });
  } catch (cause) {
    if (init?.signal?.aborted) throw cause;
    throw new ApiError(errorMessage(null, 0), 0);
  }
  if (!response.ok) throw await failure(response, path, init?.method?.toUpperCase());
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function jsonRequest<T>(path: string, method: "POST" | "PATCH" | "PUT", payload: unknown, signal?: AbortSignal) {
  return request<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal });
}

export function queryString(filters: object) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "" && !(key === "status" && value === "all")) params.set(key, String(value));
  }
  return params.toString();
}
