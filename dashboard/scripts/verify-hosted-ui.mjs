// Local visual smoke against a production build. Every API is synthetic and all
// non-loopback page requests are blocked. No backend, identity or provider needed.
// Run: node scripts/verify-hosted-ui.mjs [/absolute/path/to/chrome]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = `${root}.hosted-ui-qa`;
await mkdir(out, { recursive: true });
const profile = await mkdtemp(`${out}/profile-`);
const freePort = () => new Promise((resolve) => {
  const server = createServer(); server.listen(0, "127.0.0.1", () => {
    const port = server.address().port; server.close(() => resolve(port));
  });
});
const [port, debugPort] = await Promise.all([freePort(), freePort()]);
const origin = `http://127.0.0.1:${port}`;
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, stdio: "ignore" });
const chrome = spawn(process.argv[2] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-background-networking", "--disable-sync", "--disable-component-update", "--disable-default-apps", "--disable-extensions", "--disable-breakpad", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, "about:blank"], { stdio: "ignore" });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(test) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    try { if (await test()) return; } catch { /* A navigation replaces the CDP context. */ }
    await pause(100);
  }
  throw new Error("Local visual check timed out");
}
const task = { id: "assignment-qa", organization_id: "org-qa", created_by_user_id: "user-qa", goal_type: "follow-up-and-calendar", goal: "Synthetic exact follow-up and appointment", planner_mode: "deterministic", status: "awaiting_approval", phase: "waiting_for_approval", run_id: "run-qa", agent_id: "internal-qa", error_code: "", deadline_at: new Date(Date.now() + 3600000).toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), completed_at: null };
const contract = { id: "contract-qa", organization_id: "org-qa", title: "Synthetic retained contract", source_name: "example.txt", retain_source_text: true, expires_at: null };
const connection = { id: "connection-qa", organization_id: "org-qa", provider: "google_calendar", display_name: "Synthetic owned calendar", status: "active", capabilities: ["google_calendar.events.create"], settings: { credential_mode: "encrypted", calendar_ids: ["synthetic-calendar@example.test"] } };
let socket;
const pending = new Map(); let sequence = 0;
const errors = []; const writes = []; const requests = [];
next.on("error", (error) => errors.push(`Local Next process: ${error.code}`));
chrome.on("error", (error) => errors.push(`Local Chrome process: ${error.code}`));
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
function responseFor(request) {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/session") return { user: { id: "oidc-qa", email: "owner@example.test", name: "Synthetic owner" }, accessToken: "synthetic-human-qa", expires: "2099-01-01T00:00:00Z" };
  if (path.endsWith("/me")) return { id: "user-qa", email: "owner@example.test", display_name: "Synthetic owner" };
  if (path.endsWith("/organizations")) return [{ id: "org-qa", name: "Synthetic QA workspace", slug: "qa", role: "owner" }];
  if (path.endsWith("/contracts")) return [contract];
  if (path.endsWith("/members")) return [{ user_id: "user-qa", display_name: "Synthetic owner", email: "owner@example.test", role: "owner" }];
  if (path.endsWith("/integrations")) return [connection];
  if (path.endsWith("/hosted-agent-capabilities")) return { enabled: true, goal_types: ["retained-document-follow-up", "calendar-event", "follow-up-and-calendar"], planner_modes: ["deterministic", "model"], max_deadline_days: 7 };
  if (path.endsWith("/hosted-agent-tasks")) return request.method === "POST" ? task : [task];
  if (path.endsWith("/hosted-agent-tasks/assignment-qa")) return task;
  return [];
}
async function onEvent(message) {
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request } = message.params;
  if (!request.url.startsWith(`${origin}/`)) { await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }); return; }
  if (new URL(request.url).pathname.startsWith("/api/")) {
    requests.push(new URL(request.url).pathname);
    if (request.method !== "GET") writes.push({ url: new URL(request.url).pathname, body: request.postData });
    await send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Cache-Control", value: "no-store" }], body: Buffer.from(JSON.stringify(responseFor(request))).toString("base64") });
  } else await send("Fetch.continueRequest", { requestId });
}
try {
  await waitFor(async () => { try { return (await fetch(origin)).ok; } catch { return false; } });
  let target;
  await waitFor(async () => { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((item) => item.type === "page"); return Boolean(target); } catch { return false; } });
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const call = pending.get(message.id); if (!call) return;
      clearTimeout(call.timer); pending.delete(message.id);
      if (message.error) call.reject(new Error(message.error.message)); else call.resolve(message.result);
    } else void onEvent(message).catch((error) => errors.push(error.message));
  });
  await send("Runtime.enable"); await send("Page.enable"); await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await send("Page.navigate", { url: `${origin}/agent-tasks` });
  await waitFor(() => evaluate('Boolean(document.querySelector("#hosted-goal-type"))'));
  await evaluate('document.querySelector("#hosted-goal-type").value="follow-up-and-calendar";document.querySelector("#hosted-goal-type").dispatchEvent(new Event("change",{bubbles:true}))');
  await waitFor(() => evaluate('document.querySelectorAll("#hosted-calendar option").length === 2'));
  const checks = [];
  for (const theme of ["light", "dark"]) for (const width of [320, 375, 768, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    await pause(200);
    const size = await evaluate('({viewport:innerWidth,content:document.documentElement.scrollWidth,form:Math.round(document.querySelector(".hosted-assignment").getBoundingClientRect().width),inputs:[...document.querySelectorAll(".hosted-assignment input,.hosted-assignment textarea,.hosted-assignment select")].map(x=>Math.round(x.getBoundingClientRect().right))})');
    assert.ok(size.content <= width, `Overflow: ${theme}/${width}: ${size.content}`);
    assert.ok(size.inputs.every((right) => right <= width), `Input overflow: ${theme}/${width}`);
    const shot = await send("Page.captureScreenshot", { captureBeyondViewport: true });
    await writeFile(`${out}/assignment-${theme}-${width}.png`, Buffer.from(shot.data, "base64")); checks.push({ theme, width, ...size });
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await evaluate('document.querySelector("#hosted-planner").value="model";document.querySelector("#hosted-planner").dispatchEvent(new Event("change",{bubbles:true}))');
  await waitFor(() => evaluate('Boolean(document.querySelector("input[name=excerpt_consent]"))'));
  assert.ok(await evaluate('document.body.textContent.includes("any retrieved document excerpt will be sent to OpenAI")'));
  assert.equal(writes.length, 0, "Visual check must not submit an assignment");
  await send("Page.navigate", { url: `${origin}/agent-tasks/assignment-qa` });
  await waitFor(() => evaluate(`Boolean(document.querySelector('a[href="/runs/run-qa"]'))`));
  for (const width of [320, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await pause(200);
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= ${width}`), `Detail overflow: ${width}`);
    const shot = await send("Page.captureScreenshot", { captureBeyondViewport: true });
    await writeFile(`${out}/detail-${width}.png`, Buffer.from(shot.data, "base64"));
  }
  assert.deepEqual(errors, [], "No browser runtime errors");
  await writeFile(`${out}/result.json`, JSON.stringify({ checks, detailWidths: [320, 1440], runtimeErrors: errors, syntheticWrites: writes.length }, null, 2));
  console.log(`PASS: synthetic assignment light/dark at 320/375/768/1440; detail at 320/1440; model disclosure; zero writes/runtime errors. Screenshots: ${out}`);
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    const page = await evaluate("document.body?.innerText").catch(() => "Page unavailable during navigation");
    await writeFile(`${out}/failure.json`, JSON.stringify({ message: error.message, requests, errors, page }, null, 2));
  }
  throw error;
} finally {
  socket?.close(); next.kill("SIGTERM"); chrome.kill("SIGTERM");
  await Promise.all([next, chrome].map((child) => child.pid === undefined || child.exitCode !== null || child.signalCode !== null ? undefined : new Promise((resolve) => child.once("exit", resolve))));
  await rm(profile, { recursive: true, force: true });
}
