import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inspectScope, observe, STAGING_ORIGIN } from './sdk-revocation.mjs';
import { checkEvent, inspectIndependent, EVENT, OLD_CONNECTION, CALENDAR_HASH } from './calendar-inspector.mjs';
import { hiddenJSON } from './io.mjs';

// Synthetic credential only. No test uses ambient auth, sockets or live services.
const TOKEN = 'll_agent_' + 'x'.repeat(43);
const ORG = '11111111-1111-4111-8111-111111111111';
const AGENT = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const ASSIGNEE = '44444444-4444-4444-8444-444444444444';
const START = Date.parse('2026-10-15T12:00:00Z');
const tools = [
  { name: 'context.retrieve', version: '1', requires_approval: false },
  { name: 'workspace.context_tasks.create', version: '1', requires_approval: true },
];
const options = { baseUrl: STAGING_ORIGIN, org: ORG, context: CONTEXT, assignee: ASSIGNEE,
  freshAfter: '2026-10-15T11:59:00Z', waitSeconds: 10, ack: 'authorized-staging-read-only' };
function envelope() {
  return { token: TOKEN, observed_at: new Date(START).toISOString(), principal: {
    id: AGENT, organization_id: ORG, delegated_by_user_id: ASSIGNEE,
    token_sha256: createHash('sha256').update(TOKEN).digest('hex'),
    allowed_tools: tools.map((t) => t.name), context_ids: [CONTEXT], assignee_ids: [ASSIGNEE],
    contract_ids: [], calendar_targets: [], require_approval: true, max_actions_per_run: 1,
    status: 'active', revoked_at: null, created_at: '2026-10-15T11:59:30Z', expires_at: '2026-10-15T12:05:00Z',
    delegator_role: 'owner', run_count: 0,
  } };
}
function rig(statuses = [200, 401], tweaks = {}) {
  let now = START;
  const calls = [], baseline = [];
  const dependencies = {
    clock: () => now, sleep: async (ms) => { now += ms; }, onBaseline: (r) => baseline.push(r),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
      return new Response(JSON.stringify(status === 200 ? tools : { detail: TOKEN + ' private upstream body' }), {
        status, headers: { date: new Date(now).toUTCString() },
      });
    }, ...tweaks,
  };
  return { dependencies, calls, baseline, advance: (ms) => { now += ms; } };
}

for (const status of [401, 403]) test(`actual SDK baseline -> ${status}, only bounded GETs, redacted evidence`, async () => {
  const r = rig([200, 200, status]), input = envelope();
  const result = await observe(input, options, r.dependencies);
  assert.equal(result.status, status);
  assert.equal(result.sdk_denial_observed, true);
  assert.equal(result.owner_revocation_metadata_still_required, true);
  assert.match(result.sdk_source_sha256['sdk/src/client.ts'], /^[a-f0-9]{64}$/);
  assert.equal(r.baseline.length, 1);
  assert.equal(r.calls.length, 3);
  for (const { url, init } of r.calls) {
    assert.equal(url, STAGING_ORIGIN + '/api/v1/agent/tools');
    assert.equal(init.method, 'GET'); assert.equal(init.body, undefined);
    assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, 'Bearer ' + TOKEN);
  }
  assert.equal(input.token, '');
  assert.doesNotMatch(JSON.stringify([result, r.baseline]), /ll_agent_|private upstream|token_sha256/);
});

for (const [name, change] of [
  ['wrong org', (p) => { p.organization_id = AGENT; }],
  ['wrong context', (p) => { p.context_ids = [ORG]; }],
  ['wrong assignee', (p) => { p.assignee_ids = [ORG]; }],
  ['calendar scope', (p) => { p.calendar_targets = [{ connection_id: AGENT }]; }],
  ['contract scope', (p) => { p.contract_ids = [ORG]; }],
  ['extra tool', (p) => { p.allowed_tools.push('documents.retrieve'); }],
  ['missing tool', (p) => { p.allowed_tools.pop(); }],
  ['duplicate tool', (p) => { p.allowed_tools[1] = p.allowed_tools[0]; }],
  ['no human approval', (p) => { p.require_approval = false; }],
  ['more than one action', (p) => { p.max_actions_per_run = 2; }],
  ['unbound bearer', (p) => { p.token_sha256 = '0'.repeat(64); }],
  ['already revoked', (p) => { p.revoked_at = '2026-10-15T11:59:59Z'; }],
  ['expired bearer', (p) => { p.expires_at = '2026-10-15T11:59:59Z'; }],
  ['too near expiry', (p) => { p.expires_at = '2026-10-15T12:00:10Z'; }],
  ['old graph-era credential', (p) => { p.created_at = '2026-10-15T06:00:00Z'; }],
  ['existing run', (p) => { p.run_count = 1; }],
  ['delegator removed', (p) => { p.delegator_role = null; }],
]) test(`scope fail-closed before HTTP: ${name}`, async () => {
  const input = envelope(), r = rig(); change(input.principal);
  await assert.rejects(observe(input, options, r.dependencies));
  assert.equal(r.calls.length, 0);
});

test('stale metadata, old fresh-after and malformed dates do not qualify', () => {
  const input = envelope(); input.observed_at = '2026-10-15T11:58:00Z';
  assert.throws(() => inspectScope(input, options, START));
  assert.throws(() => inspectScope(envelope(), { ...options, freshAfter: '2026-10-15T06:00:00Z' }, START));
  input.observed_at = 'not-a-date'; assert.throws(() => inspectScope(input, options, START));
});

for (const statuses of [[401], [403], [302], [200, 404], [200, 429], [200, 500]]) test(`no false success or retries for ${statuses}`, async () => {
  const r = rig(statuses);
  await assert.rejects(observe(envelope(), options, r.dependencies));
  assert.equal(r.calls.length, statuses.length);
  assert.equal(r.baseline.length, statuses[0] === 200 ? 1 : 0);
});

test('no denial -> bounded stop, no confirmation input', async () => {
  const r = rig([200]);
  await assert.rejects(observe(envelope(), { ...options, waitSeconds: 3 }, r.dependencies), /no_denial/);
  assert.equal(r.calls.length, 3);
});
test('denial after expiry cannot pass', async () => {
  const r = rig();
  const fetch = r.dependencies.fetchImpl;
  r.dependencies.fetchImpl = async (...args) => { if (r.calls.length) r.advance(301000); return fetch(...args); };
  await assert.rejects(observe(envelope(), options, r.dependencies), /denial_not_pre_expiry/);
});
test('missing server Date cannot qualify pre-expiry proof', async () => {
  const r = rig([200], { fetchImpl: async () => new Response(JSON.stringify(tools)) });
  await assert.rejects(observe(envelope(), options, r.dependencies));
});
test('abort stops observation without a mutation', async () => {
  const r = rig([200]); const controller = new AbortController();
  r.dependencies.onBaseline = () => controller.abort();
  await assert.rejects(observe(envelope(), options, { ...r.dependencies, signal: controller.signal }));
  assert.equal(r.calls.length, 1);
});
test('unsafe base URL rejected before HTTP', async () => {
  for (const baseUrl of ['https://staging.invalid', 'https://lenslayer-api-staging-th7nw37zha-ew.a.run.app.evil.invalid', 'http://staging.invalid', 'https://staging.invalid/other', 'https://user:pass@staging.invalid', 'https://staging.invalid/?token=bad']) {
    const r = rig(); await assert.rejects(observe(envelope(), { ...options, baseUrl }, r.dependencies));
    assert.equal(r.calls.length, 0);
  }
});

function tty() {
  const input = new EventEmitter(), signals = new EventEmitter(), output = [];
  let paused = true;
  input.isTTY = true; input.isRaw = false;
  input.isPaused = () => paused; input.pause = () => { paused = true; };
  input.resume = () => { paused = false; };
  input.setRawMode = (raw) => { input.isRaw = raw; };
  return { input, signals, output, args: { input, signals, output: { write: (s) => output.push(s) }, timeoutMs: 50 } };
}
for (const ending of ['success', 'SIGINT', 'SIGTERM', 'SIGHUP', 'SIGTSTP', 'ctrl-c', 'eof', 'timeout', 'invalid', 'oversize']) test(`hidden stdin restores natural TTY and listeners: ${ending}`, async () => {
  const r = tty(), promise = hiddenJSON(r.args);
  assert.equal(r.input.isRaw, true);
  if (ending === 'success') r.input.emit('data', Buffer.from('{"token":"synthetic-sensitive"}\r'));
  else if (ending.startsWith('SIG')) r.signals.emit(ending);
  else if (ending === 'ctrl-c') r.input.emit('data', Buffer.from('\u0003'));
  else if (ending === 'eof') r.input.emit('end');
  else if (ending === 'invalid') r.input.emit('data', Buffer.from('bad\r'));
  else if (ending === 'oversize') r.input.emit('data', Buffer.from('x'.repeat(65537)));
  if (ending === 'success') assert.equal((await promise).token, 'synthetic-sensitive');
  else await assert.rejects(promise);
  assert.equal(r.input.isRaw, false); assert.equal(r.input.isPaused(), true);
  assert.equal(r.input.listenerCount('data'), 0); assert.equal(r.signals.eventNames().length, 0);
  assert.doesNotMatch(r.output.join(''), /synthetic-sensitive|ll_agent_/);
});

// Fixed disposable fixture identifier only; no credential or live proof is loaded.
import { readFileSync } from 'node:fs';
const calendar = JSON.parse(readFileSync(new URL('./fixtures/disposable-calendar.json', import.meta.url))).calendar_id;
function calendarEnvelope() {
  return { ack: 'existing-independent-read-only-grant', token: 'synthetic-inspector-only', calendar_id: calendar,
    expected: { id: EVENT, status: 'confirmed', visibility: 'private', summary: '[STAGING SYNTHETIC] Private Calendar acceptance — 15 Oct 2026',
      description: 'Synthetic exact durable description', start: { dateTime: '2026-10-15T09:00:00+00:00' }, end: { dateTime: '2026-10-15T09:15:00+00:00' }, reminders: { useDefault: false },
      extendedProperties: { private: { lenslayer_connection: OLD_CONNECTION, lenslayer_calendar: CALENDAR_HASH, lenslayer_run: 'ee06a0a5-208d-422f-a147-c1417471cca5', lenslayer_action: '96e786d7-74f1-4f4c-82be-c4f9b5e95377', lenslayer_input: '850e803ffdde52e0a48ac9d40481cc8c5faedb34f742771b956c466cf599d176' } } } };
}
function calendarRig(input, mutate = () => {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    let data = calls.length === 1 ? { id: calendar, accessRole: 'owner', primary: false } : calls.length === 2 ? structuredClone(input.expected) : { items: [{ id: EVENT }] };
    mutate(data, calls.length);
    return new Response(JSON.stringify(data));
  } };
}
test('independent inspector performs exactly three fixed-origin GETs; reports limits', async () => {
  const input = calendarEnvelope(), r = calendarRig(input);
  const result = await inspectIndependent(input, r);
  assert.equal(r.calls.length, 3);
  assert.equal(result.owned_secondary_verified, true); assert.equal(result.renewed_product_grant_qualified, false);
  assert.equal(result.same_google_account_subject_proved, false);
  for (const { url, init } of r.calls) { assert.ok(url.startsWith('https://www.googleapis.com/calendar/v3/')); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); }
  assert.equal(input.token, '');
  assert.doesNotMatch(JSON.stringify(result), /synthetic-inspector|group.calendar|durable description/);
});
for (const [name, mutate] of [
  ['not owner', (d, n) => { if (n === 1) d.accessRole = 'reader'; }],
  ['primary', (d, n) => { if (n === 1) d.primary = true; }],
  ['deleted', (d, n) => { if (n === 1) d.deleted = true; }],
  ['wrong event', (d, n) => { if (n === 2) d.id = 'other'; }],
  ['changed description', (d, n) => { if (n === 2) d.description = 'other'; }],
  ['changed provenance', (d, n) => { if (n === 2) d.extendedProperties.private.lenslayer_connection = 'new'; }],
  ['attendees', (d, n) => { if (n === 2) d.attendees = [{}]; }],
  ['recurrence', (d, n) => { if (n === 2) d.recurrence = ['RRULE']; }],
  ['attachments', (d, n) => { if (n === 2) d.attachments = [{}]; }],
  ['conference', (d, n) => { if (n === 2) d.conferenceData = {}; }],
  ['next page', (d, n) => { if (n === 3) d.nextPageToken = 'hidden'; }],
  ['duplicate event', (d, n) => { if (n === 3) d.items.push({ id: EVENT }); }],
]) test(`independent inspector fails closed: ${name}`, async () => {
  const input = calendarEnvelope(), r = calendarRig(input, mutate);
  await assert.rejects(inspectIndependent(input, r)); assert.ok(r.calls.length <= 3);
});
test('wrong calendar is rejected before any inspector request', async () => {
  const input = calendarEnvelope(); input.calendar_id = 'other@group.calendar.google.com';
  const r = calendarRig(input); await assert.rejects(inspectIndependent(input, r)); assert.equal(r.calls.length, 0);
});
test('equivalent explicit-offset dates pass; naive dates and reminder overrides fail', () => {
  const { expected } = calendarEnvelope(), actual = structuredClone(expected);
  actual.start.dateTime = '2026-10-15T10:00:00+01:00'; checkEvent(actual, expected);
  actual.start.dateTime = '2026-10-15T09:00:00'; assert.throws(() => checkEvent(actual, expected));
  actual.start = expected.start; actual.reminders.overrides = [{}]; assert.throws(() => checkEvent(actual, expected));
});
test('CLI malformed hidden input emits only redacted failure (no network)', () => {
  for (const name of ['sdk-revocation.mjs', 'calendar-inspector.mjs']) {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { input: TOKEN + '\n', encoding: 'utf8', timeout: 5000 });
    assert.equal(child.status, 1); assert.doesNotMatch(child.stdout + child.stderr, /ll_agent_/);
    assert.equal(JSON.parse(child.stdout).complete, false);
  }
});

test('fresh unflagged Node actual CLI and SDK loader under iCloud-style spaces', () => {
  const directory = mkdtempSync(fileURLToPath(new URL('./iCloud Drive Local ', import.meta.url)));
  try {
    const target = join(directory, 'operator', 'staging-acceptance');
    mkdirSync(target, { recursive: true });
    for (const name of ['sdk-revocation.mjs', 'calendar-inspector.mjs', 'io.mjs', 'sdk-source.mjs']) {
      cpSync(fileURLToPath(new URL(name, import.meta.url)), join(target, name));
    }
    cpSync(fileURLToPath(new URL('../../sdk/src/', import.meta.url)), join(directory, 'sdk', 'src'), { recursive: true });
    for (const name of ['sdk-revocation.mjs', 'calendar-inspector.mjs']) {
      const child = spawnSync(process.execPath, [join(target, name)], { input: TOKEN + '\n', encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
      assert.equal(child.status, 1); assert.equal(child.signal, null);
      assert.equal(JSON.parse(child.stdout).complete, false);
      assert.doesNotMatch(child.stdout + child.stderr, /ll_agent_|ERR_MODULE_NOT_FOUND/);
    }
    const loader = pathToFileURL(join(target, 'sdk-source.mjs')).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `const sdk=await (await import(${JSON.stringify(loader)})).loadSDK(); console.log(JSON.stringify(sdk.sourceHashes));`], { encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH } });
    assert.equal(child.status, 0, child.stderr); assert.equal(child.signal, null);
    const hashes = JSON.parse(child.stdout);
    assert.equal(hashes['sdk/src/client.ts'], createHash('sha256').update(readFileSync(new URL('../../sdk/src/client.ts', import.meta.url))).digest('hex'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
