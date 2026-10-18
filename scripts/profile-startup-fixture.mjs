// LOCAL SYNTHETIC ONLY. No production cookies, secrets, API or model calls.
// Usage: node scripts/profile-startup-fixture.mjs WORKTREE OUTPUT SHA PUPPETEER_MODULE PORT
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const [worktree, output, revision, puppeteerModule, portText = "3215"] = process.argv.slice(2);
if (!worktree || !output || !revision || !puppeteerModule) throw new Error("Missing fixture arguments");
const port = Number(portText);
const origin = `http://127.0.0.1:${port}`;
const secret = "synthetic-local-startup-fixture-never-a-production-secret";
const require = createRequire(pathToFileURL(resolve(worktree, "dashboard/package.json")));
const { encode } = require("next-auth/jwt");
const { default: puppeteer } = await import(pathToFileURL(resolve(puppeteerModule)).href);
mkdirSync(output, { recursive: true });
let started = performance.now();
const apiRequests = [];
const fixture = createServer(async (request, response) => {
  const path = new URL(request.url, "http://fixture.invalid").pathname;
  const label = path === "/api/v1/me" ? "me" : path === "/api/v1/organizations" ? "organizations" : path.endsWith("/notifications") ? "notifications" : path.endsWith("/contracts") ? "contracts" : path.endsWith("/tasks") ? "tasks" : "other-fixture-request";
  apiRequests.push({ label, startMs: performance.now() - started });
  // Equal, deterministic synthetic upstream work for both revisions.
  await new Promise((r) => setTimeout(r, 80));
  const body = label === "me" ? { id: "synthetic-user", email: "synthetic@example.test", display_name: "Synthetic Reviewer" } : label === "organizations" ? [{ id: "synthetic-org", name: "Synthetic Workspace", slug: "synthetic", role: "owner", created_at: "2026-01-01T00:00:00Z" }] : path.startsWith("/api/v1/invitations/") ? {
    organization_name: "Synthetic Workspace", email_hint: "s***@example.test", role: "reviewer", status: "pending", expires_at: "2099-01-01T00:00:00Z",
  } : path.startsWith("/api/v1/shared/") ? {
    shared_for: "Synthetic review", contract_title: "Fictional supplier agreement", counterparty: "Synthetic Supplier", contract_type: "Services", overall_attention: "Medium", executive_summary: "Synthetic evidence only. Review the pricing terms before signing.", expires_at: "2099-01-01T00:00:00Z",
    risks: [{ title: "Price changes", risk_level: "high", explanation: "The supplier can change prices.", evidence: "Synthetic pricing clause.", recommendation: "Agree advance notice." }], missing_protections: [], negotiation_priorities: [],
  } : [];
  response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "private, no-store" });
  response.end(JSON.stringify(body));
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const fixturePort = fixture.address().port;
const app = spawn(process.execPath, [resolve(worktree, "dashboard/node_modules/next/dist/bin/next"), "start", "--port", String(port)], {
  cwd: resolve(worktree, "dashboard"), stdio: "ignore",
  // Deliberate allowlist: don't inherit any real OIDC configuration/credentials.
  env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", NEXTAUTH_URL: origin, NEXTAUTH_SECRET: secret, PLATFORM_API_URL: `http://127.0.0.1:${fixturePort}`,
    AUTH_OIDC_ISSUER: `http://127.0.0.1:${fixturePort}`, AUTH_OIDC_CLIENT_ID: "synthetic-client", AUTH_OIDC_CLIENT_SECRET: "synthetic-secret", AUTH_OIDC_AUDIENCE: "synthetic-audience" },
});
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { await fetch(`${origin}/sample`); break; }
    catch { if (attempt > 100) throw new Error("Local fixture app did not start"); await new Promise((r) => setTimeout(r, 100)); }
  }
  browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-sandbox"] });
  const traces = [];
  for (let run = 1; run <= 3; run++) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      const observer = new MutationObserver(() => {
        if (document.querySelector(".app-shell") && !performance.getEntriesByName("fixture-shell").length) performance.mark("fixture-shell");
        if (document.querySelector(".tasks-register") && !document.querySelector(".tasks-register .skeleton") && !performance.getEntriesByName("fixture-useful-tasks").length) performance.mark("fixture-useful-tasks");
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    const now = Math.floor(Date.now() / 1000);
    const cookie = await encode({ secret, token: { sub: "auth0|synthetic-only", name: "Synthetic Reviewer", email: "synthetic@example.test", browserSessionId: "1c34b57c-32b2-4bea-80d3-a0b5c903182d", accessToken: "synthetic-never-live-bearer", accessTokenExpires: Date.now() + 3600000, iat: now, exp: now + 3600 } });
    await context.setCookie({ name: "next-auth.session-token", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" });
    const network = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      const label = path === "/tasks" ? "private-document" : path === "/api/auth/session" ? "session" : path.startsWith("/api/platform/") ? `bff-${path.split("/").at(-1)}` : null;
      if (label) network.push({ label, startMs: performance.now() - started });
    });
    apiRequests.length = 0; started = performance.now();
    await page.goto(`${origin}/tasks`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".app-shell");
    await page.waitForSelector(".tasks-page");
    const timings = await page.evaluate(() => ({
      navigation: performance.getEntriesByType("navigation").map((e) => ({ responseStart: e.responseStart, domContentLoaded: e.domContentLoadedEventEnd, load: e.loadEventEnd })),
      paints: performance.getEntriesByType("paint").map((e) => ({ name: e.name, time: e.startTime })),
      usefulContent: performance.getEntriesByType("mark").filter((e) => e.name.startsWith("fixture-")).map((e) => ({ name: e.name, time: e.startTime })),
    }));
    traces.push({ run, browserRequests: network, upstreamRequests: [...apiRequests], timings });
    await page.screenshot({ path: resolve(output, `private-tasks-${run}.png`), fullPage: true });
    await context.close();
  }
  const visuals = [];
  for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument((theme) => localStorage.setItem("lenslayer.theme", theme), theme);
    for (const route of ["/sample", "/signin", "/signup", "/auth/signed-out", "/invite/synthetic-token", "/shared/synthetic-token", "/settings/developers"]) {
      const requests = [];
      const listener = (request) => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/auth/")) requests.push(path); };
      page.on("request", listener);
      await page.goto(`${origin}${route}`, { waitUntil: "networkidle0" });
      await page.evaluate(() => document.fonts.ready);
      const name = `${route.replaceAll("/", "-").slice(1)}-${width}-${theme}`;
      await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: true });
      const styles = await page.evaluate(() => [...document.querySelectorAll("main, main *, .brand, .button")].map((el) => {
        const rect = el.getBoundingClientRect(); const s = getComputedStyle(el);
        return { tag: el.tagName, class: el.className?.baseVal ?? el.className,
          box: [rect.x, rect.y, rect.width, rect.height].map((n) => Math.round(n * 100) / 100),
          color: s.color, background: s.backgroundColor, fontSize: s.fontSize, fontWeight: s.fontWeight, display: s.display,
        };
      }));
      writeFileSync(resolve(output, `${name}.styles.json`), JSON.stringify(styles, null, 2));
      visuals.push({ route, width, theme, authRequests: requests });
      page.off("request", listener);
    }
    await context.close();
  }
  writeFileSync(resolve(output, "fixture-traces.json"), JSON.stringify({ revision, synthetic: true, upstreamDelayMs: 80, browser: await browser.version(), traces, visuals }, null, 2));
  console.log(JSON.stringify({ revision, traces, visuals }, null, 2));
} finally {
  if (browser) await browser.close();
  app.kill("SIGTERM");
  await new Promise((r) => fixture.close(r));
}
