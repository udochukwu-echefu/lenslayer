import { calendarAttestation, readTrustedSession, sameOriginCalendarRequest } from "@/lib/calendar-session.server";

export const dynamic = "force-dynamic";
const safeHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
const fail = (status: number) => Response.json({ detail: "Calendar operation could not be confirmed. Inspect connections before restarting consent." }, { status, headers: safeHeaders });

export async function POST(request: Request, context: { params: Promise<{ organizationId: string; operation: string[] }> }) {
  if (!sameOriginCalendarRequest(request)) return fail(403);
  const { organizationId, operation } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(organizationId)) return fail(400);
  const tail = operation.join("/");
  const disconnect = operation.length === 3 && operation[0] === "connections" && operation[2] === "disconnect" && /^[A-Za-z0-9_-]{1,64}$/.test(operation[1]);
  if (!["oauth/start", "oauth/callback"].includes(tail) && !disconnect) return fail(404);
  const key = process.env.CALENDAR_SESSION_BINDING_KEY ?? "";
  if (key.length < 32) return fail(503);
  try {
    const session = await readTrustedSession();
    if (!session) return fail(401); // caller Authorization/session text is never trusted
    // Bound the stream before parsing; a caller cannot make the BFF buffer an
    // arbitrarily large body just to discover that it exceeds the limit.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); return fail(413); }
        chunks.push(value);
      }
    }
    const wire = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { wire.set(chunk, offset); offset += chunk.byteLength; }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(wire);
    const input = JSON.parse(raw || "{}");
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400);
    const fields = tail === "oauth/start" ? { display_name: 255, calendar_id: 1024 } : tail === "oauth/callback" ? { code: 4096, state: 4096 } : {};
    if (Object.keys(input).length !== Object.keys(fields).length || Object.entries(fields).some(([name, max]) => typeof input[name] !== "string" || !input[name] || input[name].length > max)) return fail(400);
    const body = disconnect ? { connection_id: operation[1] } : input as Record<string, string>;
    const origin = new URL(process.env.PLATFORM_API_URL ?? "http://127.0.0.1:8000");
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" ||
        (origin.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) return fail(503);
    if (!disconnect) {
      const eligibility = await fetch(`${origin.origin}/api/v1/organizations/${organizationId}/calendar/oauth/eligibility`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30_000),
      });
      if (!eligibility.ok) return fail(eligibility.status >= 400 && eligibility.status < 500 ? eligibility.status : 503);
      if ((await eligibility.json()).configured !== true) return fail(403);
    }
    const attestation = await calendarAttestation(key, session.subject, session.sessionId, organizationId, disconnect ? "connections/disconnect" : tail, body);
    const upstream = await fetch(`${origin.origin}/api/v1/organizations/${organizationId}/calendar/${tail}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessToken}`, "X-LensLayer-Calendar-Session": attestation },
      body: JSON.stringify(input), cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok) return fail(upstream.status >= 400 && upstream.status < 500 ? upstream.status : 503);
    const data = await upstream.json();
    let result: Record<string, unknown>;
    if (tail === "oauth/start") result = { authorization_url: data.authorization_url, expires_at: data.expires_at };
    else if (disconnect) result = { connection_id: data.connection_id, status: data.status, provider_revocation_pending: data.provider_revocation_pending };
    else {
      const fields = ["id", "organization_id", "provider", "display_name", "external_account_id", "status", "capabilities", "last_sync_at", "error_message", "created_by_user_id", "created_by_name", "created_at", "updated_at"];
      result = Object.fromEntries(fields.map((name) => [name, data[name]]));
      result.settings = Object.fromEntries(["calendar_ids", "credential_mode", "identity_kind", "provider_account_verified", "calendar_ownership_verified"].map((name) => [name, data.settings?.[name]]));
    }
    return Response.json(result, { status: upstream.status, headers: safeHeaders });
  } catch { return fail(503); } // no bodies, URLs, proofs, keys or bearer excerpts in logs
}
