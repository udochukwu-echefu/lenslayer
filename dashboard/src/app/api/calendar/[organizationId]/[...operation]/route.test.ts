import { webcrypto } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readTrustedSession, calendarAttestation } from "@/lib/calendar-session.server";
import * as calendarSession from "@/lib/calendar-session.server";
import { POST } from "./route";
vi.mock("@/lib/trusted-session.server", () => ({ readTrustedSession: vi.fn() }));
const key = "synthetic-bff-session-HMAC-key-never-deploy-".repeat(2);
const session = { subject: "auth0|synthetic", sessionId: "6a05c1c7-9d1d-467a-84ad-0cfe75d2d61f", accessToken: "PRIVATE-HUMAN-BEARER" };
const input = { display_name: "Synthetic 📄", calendar_id: "owned@group.calendar.google.com" };
const context = { params: Promise.resolve({ organizationId: "org-1", operation: ["oauth", "start"] }) };
const request = (headers = {}, body: unknown = input) => new Request("https://dashboard.example.test/api/calendar/org-1/oauth/start", { method: "POST",
  headers: { Origin: "https://dashboard.example.test", "Content-Type": "application/json", "X-LensLayer-Calendar-CSRF": "1", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto); vi.stubEnv("NEXTAUTH_URL", "https://dashboard.example.test");
  vi.stubEnv("CALENDAR_SESSION_BINDING_KEY", key); vi.stubEnv("PLATFORM_API_URL", "https://backend.example.test");
  vi.mocked(readTrustedSession).mockReset().mockResolvedValue(session);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("binds authenticated cookie identity, organization, operation and exact Unicode body; never returns proof/bearer/key", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ configured: true })).mockResolvedValueOnce(Response.json({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?state=opaque", expires_at: "2099-01-01", proof: "PRIVATE", bearer: session.accessToken }));
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request({ Authorization: "Bearer caller-asserted" }), context);
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(fetcher.mock.calls[0][0]).toBe("https://backend.example.test/api/v1/organizations/org-1/calendar/oauth/eligibility");
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("X-LensLayer-Calendar-Session");
  const [url, options] = fetcher.mock.calls[1];
  expect(url).toBe("https://backend.example.test/api/v1/organizations/org-1/calendar/oauth/start");
  expect(options.headers.Authorization).toBe(`Bearer ${session.accessToken}`);
  const proof = options.headers["X-LensLayer-Calendar-Session"];
  const claims = JSON.parse(Buffer.from(proof.split(".")[1], "base64url").toString());
  expect(claims).toMatchObject({ sub: session.subject, org: "org-1", op: "oauth/start", aud: "lenslayer-calendar-session" });
  expect(claims.exp - claims.iat).toBe(60); expect(claims.fp).toMatch(/^[a-f0-9]{64}$/);
  expect(claims).not.toHaveProperty("sessionId"); expect(options.redirect).toBe("manual");
  const body = await response.text();
  for (const secret of [key, proof, session.sessionId, session.accessToken, "caller-asserted"]) expect(body).not.toContain(secret);
  expect(body).not.toContain('"proof"');
});

it.each([403, 503, 302, 200])("does not mint OAuth proofs when pilot eligibility is denied or unconfirmed (%s)", async (status) => {
  const attest = vi.spyOn(calendarSession, "calendarAttestation");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ configured: false }, { status }));
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request(), context);
  expect(response.status).toBe(status === 403 || status === 200 ? 403 : 503);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(attest).not.toHaveBeenCalled();
});

it("still mints disconnect-only proofs without pilot admission for credential cleanup", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ connection_id: "conn-1", status: "revoked", provider_revocation_pending: false }));
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request({}, {}), { params: Promise.resolve({ organizationId: "org-1", operation: ["connections", "conn-1", "disconnect"] }) });
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain("connections/conn-1/disconnect");
  const proof = fetcher.mock.calls[0][1].headers["X-LensLayer-Calendar-Session"];
  expect(JSON.parse(Buffer.from(proof.split(".")[1], "base64url").toString()).op).toBe("connections/disconnect");
});

it.each([{ Origin: "https://attacker.example.test" }, { "X-LensLayer-Calendar-CSRF": "" }, { "sec-fetch-site": "cross-site" }])("rejects Origin/CSRF %j before reading session or forwarding", async (headers) => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect((await POST(request(headers), context)).status).toBe(403);
  expect(readTrustedSession).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
});

it("missing cookie login/key, caller session IDs, redirects and credential errors never fall back or leak", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  vi.mocked(readTrustedSession).mockResolvedValue(null);
  expect((await POST(request({ Authorization: "Bearer caller-asserted" }), context)).status).toBe(401);
  vi.mocked(readTrustedSession).mockResolvedValue(session);
  expect((await POST(request({}, { ...input, sessionId: "caller-session" }), context)).status).toBe(400);
  vi.stubEnv("CALENDAR_SESSION_BINDING_KEY", "");
  expect((await POST(request(), context)).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  vi.stubEnv("CALENDAR_SESSION_BINDING_KEY", key);
  fetcher.mockResolvedValue(new Response("PRIVATE-HUMAN-BEARER", { status: 302, headers: { location: "https://attacker.test" } }));
  const response = await POST(request(), context);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE-HUMAN-BEARER"); expect(fetcher).toHaveBeenCalledTimes(1);
});

it("new login changes fingerprint and TypeScript attestation is verified by the actual Python protocol without provider HTTP", async () => {
  const attestation = await calendarAttestation(key, session.subject, session.sessionId, "org-1", "oauth/start", input);
  const fresh = await calendarAttestation(key, session.subject, crypto.randomUUID(), "org-1", "oauth/start", input);
  const claims = (value: string) => JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString());
  expect(claims(attestation).fp).not.toBe(claims(fresh).fp);
  const root = resolve(process.cwd(), "..");
  // CI installs Python through setup-python; local development uses the repo venv.
  const localPython = resolve(root, ".venv/bin/python");
  const pythonExecutable = process.env.LENSLAYER_TEST_PYTHON ?? (existsSync(localPython) ? localPython : "python3");
  const python = `import sys,json,os
os.environ.clear()
import dotenv
dotenv.load_dotenv=lambda *a,**k:False
from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from backend.app.database import Base
from backend.app.calendar_session import verify_session_proof
data=json.load(sys.stdin)
engine=create_engine('sqlite://')
Base.metadata.create_all(engine)
with Session(engine) as session:
  verify_session_proof(SimpleNamespace(calendar_session_binding_key=data['key']),session,SimpleNamespace(external_subject=data['subject']),'org-1','oauth/start',data['body'],data['proof'])
print('verified')`;
  const result = spawnSync(pythonExecutable, ["-c", python], { cwd: root, env: { PATH: process.env.PATH, NODE_ENV: "test" }, input: JSON.stringify({ key, subject: session.subject, body: input, proof: attestation }), encoding: "utf8" });
  expect(result.error?.name).toBeUndefined();
  expect(result.status).toBe(0); expect(result.stdout.trim()).toBe("verified"); // no proof/secret logged on either side
});
