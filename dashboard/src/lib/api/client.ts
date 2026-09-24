import { getSession } from "next-auth/react";
import { PUBLIC_ACCESS_ENABLED } from "../workspace-mode";

export function resolvePlatformApiPrefix(platformApiUrl?: string) {
  const origin = platformApiUrl?.replace(/\/$/, "");
  return origin ? `${origin}/api/v1` : "/api/platform/api/v1";
}

export const API_PREFIX = resolvePlatformApiPrefix(
  process.env.NEXT_PUBLIC_PLATFORM_API_URL,
);
let sessionRequest: ReturnType<typeof getSession> | null = null;
let cachedSession: Awaited<ReturnType<typeof getSession>> = null;
let sessionCachedAt = 0;
const SESSION_CACHE_MS = 30_000;

function authenticatedSession() {
  if (
    cachedSession?.accessToken &&
    Date.now() - sessionCachedAt < SESSION_CACHE_MS
  ) {
    return Promise.resolve(cachedSession);
  }
  if (!sessionRequest) {
    sessionRequest = getSession()
      .then((session) => {
        if (session?.accessToken) {
          cachedSession = session;
          sessionCachedAt = Date.now();
        }
        return session;
      })
      .finally(() => {
        sessionRequest = null;
      });
  }
  return sessionRequest;
}

const waitForSessionHydration = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 250));

export async function resolveAuthenticatedSession(
  getCurrentSession = authenticatedSession,
  pause = waitForSessionHydration,
) {
  const session = await getCurrentSession();
  if (session?.accessToken) return session;

  // NextAuth can report an authenticated UI one tick before the access token is
  // readable through getSession(). Give mutating requests one short grace retry.
  await pause();
  return getCurrentSession();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(message);
  }
}

function errorMessage(detail: unknown, status: number): string {
  const value =
    typeof detail === "object" && detail && "detail" in detail
      ? detail.detail
      : detail;
  if (
    typeof value === "string" &&
    value.trim() &&
    !value.trim().startsWith("<")
  )
    return value;
  if (Array.isArray(value)) {
    const messages = value.flatMap((issue: unknown) => {
      if (
        !issue ||
        typeof issue !== "object" ||
        !("msg" in issue) ||
        typeof issue.msg !== "string"
      )
        return [];
      const location =
        "loc" in issue && Array.isArray(issue.loc)
          ? issue.loc
              .filter(
                (part) => !["body", "query", "path"].includes(String(part)),
              )
              .join(".")
          : "";
      return [location ? `${location}: ${issue.msg}` : issue.msg];
    });
    if (messages.length) return messages.join("; ");
  }
  return `Request failed (${status})`;
}

export async function request<T>(
  path: string,
  init?: RequestInit,
  usePublicAccess = PUBLIC_ACCESS_ENABLED,
): Promise<T> {
  if (usePublicAccess) {
    const { getDemoResponse } = await import("../demo-data");
    const preview = getDemoResponse(path, init);
    if (preview.handled && "error" in preview)
      throw new ApiError(preview.error, preview.status);
    if (preview.handled) return preview.value as T;
  }
  const headers = new Headers(init?.headers);
  const method = init?.method?.toUpperCase() ?? "GET";
  const session =
    method === "GET"
      ? await authenticatedSession()
      : await resolveAuthenticatedSession();
  if (session?.accessToken)
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    // Read once: a failed json() call already consumes the response body.
    const body = await response.text();
    let detail: unknown = body;
    try {
      detail = JSON.parse(body);
    } catch {
      /* Keep plain-text upstream errors. */
    }
    throw new ApiError(
      errorMessage(detail, response.status),
      response.status,
      detail,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function download(path: string, filename: string) {
  const session = await resolveAuthenticatedSession();
  if (!session?.accessToken)
    throw new ApiError("Sign in to download this file.", 401);
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!response.ok)
    throw new ApiError(`Download failed (${response.status})`, response.status);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
export function jsonRequest<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT",
  payload: unknown,
  usePublicAccess = PUBLIC_ACCESS_ENABLED,
): Promise<T> {
  return request<T>(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    usePublicAccess,
  );
}
