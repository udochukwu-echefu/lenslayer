import { readTrustedSession, trustedSessionMutationAllowed } from "@/lib/trusted-session.server";

const FORWARDED_HEADERS = ["authorization", "content-type"];

function upstreamUrl(request: Request, path: string[]) {
  const base = (process.env.PLATFORM_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const incoming = new URL(request.url);
  const safePath = path.map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
  return `${base}/${safePath}${incoming.search}`;
}

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const isPublicInvitationPreview = request.method === "GET" && path[0] === "api" && path[1] === "v1" && path[2] === "invitations" && path.length === 4;
  const isPublicSharedReview = request.method === "GET" && path[0] === "api" && path[1] === "v1" && path[2] === "shared" && path.length === 4;
  const isPublicRequest = isPublicInvitationPreview || isPublicSharedReview;

  if (!headers.has("authorization") && !isPublicRequest) {
    let session;
    try { session = await readTrustedSession(); } catch { return Response.json({ detail: "Sign in to continue." }, { status: 401 }); }
    if (session) {
      if (!["GET", "HEAD"].includes(request.method) && !trustedSessionMutationAllowed(request)) return Response.json({ detail: "Request origin could not be verified." }, { status: 403 });
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    }
    else {
      if (process.env.NODE_ENV !== "production") {
        headers.set("X-LensLayer-User", process.env.LENSLAYER_LOCAL_USER_ID ?? "local-reviewer");
        headers.set("X-LensLayer-Email", process.env.LENSLAYER_LOCAL_USER_EMAIL ?? "reviewer@lenslayer.local");
        headers.set("X-LensLayer-Name", process.env.LENSLAYER_LOCAL_USER_NAME ?? "Local Reviewer");
      } else return Response.json({ detail: "Sign in to continue." }, { status: 401 });
    }
  }

  const method = request.method.toUpperCase();

  try {
    const body = method === "GET" || method === "HEAD" ? undefined : request.body;
    // Node requires duplex for streamed uploads; Next/Cloudflare accept the same init.
    const init: RequestInit & { duplex?: "half" } = { method, headers, body, cache: "no-store", redirect: "manual", signal: request.signal };
    if (body) init.duplex = "half";
    const response = await fetch(upstreamUrl(request, path), init);
    const outgoing = new Headers();
    // API records and one-time credentials must not enter intermediary caches.
    outgoing.set("Cache-Control", "private, no-store");
    const contentType = response.headers.get("content-type");
    if (contentType) outgoing.set("content-type", contentType);
    const contentDisposition = response.headers.get("content-disposition");
    if (contentDisposition) outgoing.set("content-disposition", contentDisposition);
    const retryAfter = response.headers.get("retry-after");
    if (retryAfter) outgoing.set("retry-after", retryAfter);
    const requestId = response.headers.get("x-request-id");
    if (requestId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)) outgoing.set("X-Request-ID", requestId);
    if (contentType?.includes("application/x-ndjson")) outgoing.set("X-Accel-Buffering", "no");
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch {
    // Fetch exceptions can include URLs, headers, or other credential-bearing data.
    console.error("Platform API proxy failed");
    return Response.json({ detail: "The LensLayer API is unavailable. Start the platform API and try again." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
