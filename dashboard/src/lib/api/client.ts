import { getSession } from "next-auth/react";
import type { Session } from "next-auth";
import { PUBLIC_ACCESS_ENABLED } from "../workspace-mode";

export function resolvePlatformApiPrefix(platformApiUrl?: string) {
  const origin = platformApiUrl?.replace(/\/$/, "");
  return origin ? `${origin}/api/v1` : "/api/platform/api/v1";
}

// Human API credentials stay server-side; private traffic always uses the BFF.
export const API_PREFIX = "/api/platform/api/v1";
let sessionRequest: ReturnType<typeof getSession> | null = null;
let cachedSession: Awaited<ReturnType<typeof getSession>> = null;
let sessionCachedAt = 0;
const SESSION_CACHE_MS = 30_000;
let sessionGeneration = 0;

// Called synchronously by the account-keyed provider, before descendants can
// fetch. This is a hint, never authorization: every private request still goes
// through the authenticated BFF; hosted operations keep their fresh preflight.
export function seedAuthenticatedSession(session: Session | null) {
  sessionGeneration++;
  sessionRequest = null;
  cachedSession = session?.user?.id && !session.error ? session : null;
  sessionCachedAt = Date.now();
}

function authenticatedSession() {
  if (
    cachedSession?.user?.id && !cachedSession.error &&
    Date.now() - sessionCachedAt < SESSION_CACHE_MS &&
    Date.parse(cachedSession.expires) > Date.now()
  ) {
    return Promise.resolve(cachedSession);
  }
  if (!sessionRequest) {
    const generation = sessionGeneration;
    sessionRequest = getSession()
      .then((session) => {
        if (generation !== sessionGeneration) return null;
        cachedSession = null;
        if (session?.user?.id && !session.error) {
          cachedSession = session;
          sessionCachedAt = Date.now();
        }
        return session;
      })
      .finally(() => {
        if (generation === sessionGeneration) sessionRequest = null;
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
  if (session?.user?.id && !session.error) return session;

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
  sessionPolicy?: "fresh",
): Promise<T> {
  const generation = sessionGeneration;
  if (usePublicAccess) {
    const { getDemoResponse } = await import("../demo-data");
    const preview = getDemoResponse(path, init);
    if (preview.handled && "error" in preview)
      throw new ApiError(preview.error, preview.status);
    if (preview.handled) return preview.value as T;
  }
  const headers = new Headers(init?.headers);
  const method = init?.method?.toUpperCase() ?? "GET";
  if (!["GET", "HEAD"].includes(method)) headers.set("X-LensLayer-Platform-CSRF", "1");
  // These exact read-only paths are already anonymous in the BFF. They need no
  // session lookup, unlike accepting an invitation or reading private records.
  const publicPreview = method === "GET" && /^\/(?:invitations|shared)\/[^/?]+$/.test(path);
  const session = publicPreview ? null : sessionPolicy === "fresh"
    ? await resolveAuthenticatedSession(getSession)
    : method === "GET"
      ? await authenticatedSession()
      : await resolveAuthenticatedSession();
  init?.signal?.throwIfAborted();
  if (generation !== sessionGeneration) throw new ApiError("The account changed. Try again in the current workspace.", 401);
  if (sessionPolicy === "fresh" && (!session?.user?.id || session.error))
    throw new ApiError("Sign in to a private workspace to assign or inspect hosted agent tasks.", 401);
  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401 && !publicPreview && typeof window !== "undefined") {
      seedAuthenticatedSession(null);
      window.dispatchEvent(new Event("lenslayer:session-invalidated"));
    }
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
  if (!session?.user?.id || session.error)
    throw new ApiError("Sign in to download this file.", 401);
  const response = await fetch(path, {
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
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(
    path,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    },
    usePublicAccess,
  );
}
