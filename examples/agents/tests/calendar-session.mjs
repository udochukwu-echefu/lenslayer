// Explicit synthetic server-bridge proof for the disposable HTTP fixture only.
// This key is shared with tests/calendar_test_session.py and must never deploy.
import { createHash, createHmac, randomUUID } from "node:crypto";

const key = "synthetic-calendar-bff-HMAC-key-never-deploy-".repeat(2);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(name => `${JSON.stringify(name)}:${canonical(value[name])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function calendarSessionHeaders(path, method, body, subject) {
  if (method !== "POST") return {};
  const match = /^\/organizations\/([^/]+)\/calendar\/(oauth\/(?:start|callback)|connections\/([^/]+)\/disconnect)$/.exec(path);
  if (!match) return {};
  const operation = match[3] ? "connections/disconnect" : match[2];
  const payload = body ?? (match[3] ? { connection_id: match[3] } : {});
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: "lenslayer-calendar-session", iss: "lenslayer-dashboard", sub: subject,
    org: match[1], op: operation,
    fp: createHmac("sha256", key).update("lenslayer-calendar-session-v1:synthetic-browser-session-1").digest("hex"),
    body_sha256: createHash("sha256").update(canonical(payload)).digest("hex"),
    jti: randomUUID().replaceAll("-", ""), iat: now, nbf: now, exp: now + 60 };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", key).update(`${header}.${encoded}`).digest("base64url");
  return { "X-LensLayer-Calendar-Session": `${header}.${encoded}.${signature}` };
}
