import { readTrustedSession } from "./trusted-session.server";

export { readTrustedSession };

export function sameOriginCalendarRequest(request: Request) {
  try {
    const configured = new URL(process.env.NEXTAUTH_URL ?? "");
    if (configured.username || configured.password || configured.search || configured.hash ||
        (configured.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && configured.protocol === "http:" && ["localhost", "127.0.0.1"].includes(configured.hostname)))) return false;
    return request.headers.get("origin") === configured.origin && new URL(request.url).origin === configured.origin &&
      request.headers.get("x-lenslayer-calendar-csrf") === "1" &&
      request.headers.get("content-type")?.split(";")[0].trim() === "application/json" &&
      (!request.headers.has("sec-fetch-site") || request.headers.get("sec-fetch-site") === "same-origin");
  } catch { return false; }
}

function base64url(value: Uint8Array) { return Buffer.from(value).toString("base64url"); }
export function canonicalCalendarBody(body: Record<string, string>) {
  return JSON.stringify(Object.fromEntries(Object.keys(body).sort().map((key) => [key, body[key]])));
}
export async function calendarAttestation(key: string, subject: string, sessionId: string, org: string, op: string, body: Record<string, string>) {
  if (key.length < 32) throw new Error("calendar_session_unconfigured");
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hex = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("hex");
  const fingerprint = hex(await crypto.subtle.sign("HMAC", signingKey, encoder.encode(`lenslayer-calendar-session-v1:${sessionId}`)));
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", encoder.encode(canonicalCalendarBody(body))));
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: "lenslayer-calendar-session", iss: "lenslayer-dashboard", sub: subject, org, op,
    fp: fingerprint, body_sha256: bodyHash, jti: crypto.randomUUID().replaceAll("-", ""), iat: now, nbf: now, exp: now + 60 };
  const content = `${base64url(encoder.encode('{"alg":"HS256","typ":"JWT"}'))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;
  return `${content}.${base64url(new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, encoder.encode(content))))}`;
}
