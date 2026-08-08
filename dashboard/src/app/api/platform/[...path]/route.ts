import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const FORWARDED_HEADERS = ["authorization", "content-type"];

function upstreamUrl(request: Request, path: string[]) {
  const base = (process.env.PLATFORM_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  const incoming = new URL(request.url);
  const safePath = path.map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
  return `${base}/${safePath}${incoming.search}`;
}

async function proxy(request: Request, context: RouteContext<"/api/platform/[...path]">) {
  const { path } = await context.params;
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const isPublicInvitationPreview = request.method === "GET" && path[0] === "api" && path[1] === "v1" && path[2] === "invitations" && path.length === 4;
  const isPublicSharedReview = request.method === "GET" && path[0] === "api" && path[1] === "v1" && path[2] === "shared" && path.length === 4;
  const isPublicSecureIntake = path[0] === "api" && path[1] === "v1" && path[2] === "secure-intake" && (request.method === "GET" || request.method === "POST");

  if (process.env.NODE_ENV !== "production" && !headers.has("authorization")) {
    headers.set("X-Lenslayer-User", process.env.LENSLAYER_LOCAL_USER_ID ?? "local-reviewer");
    headers.set("X-Lenslayer-Email", process.env.LENSLAYER_LOCAL_USER_EMAIL ?? "reviewer@lenslayer.local");
    headers.set("X-Lenslayer-Name", process.env.LENSLAYER_LOCAL_USER_NAME ?? "Local Reviewer");
  }
  if (process.env.NODE_ENV === "production" && !headers.has("authorization") && !isPublicInvitationPreview && !isPublicSharedReview && !isPublicSecureIntake) {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) return Response.json({ detail: "Sign in to continue." }, { status: 401 });
    headers.set("authorization", `Bearer ${session.accessToken}`);
  }

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  try {
    const response = await fetch(upstreamUrl(request, path), { method, headers, body, cache: "no-store", redirect: "manual" });
    const outgoing = new Headers();
    const contentType = response.headers.get("content-type");
    if (contentType) outgoing.set("content-type", contentType);
    const contentDisposition = response.headers.get("content-disposition");
    if (contentDisposition) outgoing.set("content-disposition", contentDisposition);
    return new Response(response.body, { status: response.status, headers: outgoing });
  } catch (error) {
    console.error("Platform API proxy failed", error);
    return Response.json({ detail: "The Lenslayer API is unavailable. Start the platform API and try again." }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
