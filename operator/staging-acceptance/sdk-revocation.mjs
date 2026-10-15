import { createHash, timingSafeEqual } from 'node:crypto';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { loadSDK } from './sdk-source.mjs';
import { boundedResponse, emit, failClosed, hiddenJSON, instant, isMain, requireThat, stopSignals } from './io.mjs';

const TOOLS = ['context.retrieve', 'workspace.context_tasks.create'];
export const STAGING_ORIGIN = 'https://lenslayer-api-staging-th7nw37zha-ew.a.run.app';
const exact = (a, b) => Array.isArray(a) && a.length === b.length && new Set(a).size === a.length && b.every((v) => a.includes(v));
const id = (v) => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v);

export function inspectScope(envelope, options, now) {
  const { token, principal: p, observed_at } = envelope;
  requireThat(typeof token === 'string' && /^ll_agent_[A-Za-z0-9_-]{32,128}$/.test(token), 'invalid_fresh_bearer');
  requireThat(p && typeof p === 'object' && typeof p.token_sha256 === 'string' && /^[a-f0-9]{64}$/.test(p.token_sha256), 'missing_owner_scope_readback');
  const digest = createHash('sha256').update(token).digest();
  requireThat(timingSafeEqual(digest, Buffer.from(p.token_sha256, 'hex')), 'scope_bearer_mismatch');
  requireThat(id(p.id) && p.organization_id === options.org && id(p.delegated_by_user_id), 'wrong_principal_or_org');
  requireThat(exact(p.allowed_tools, TOOLS) && exact(p.context_ids, [options.context]) && exact(p.assignee_ids, [options.assignee]) && exact(p.contract_ids, []) && exact(p.calendar_targets, []), 'scope_not_exact');
  requireThat(p.require_approval === true && p.max_actions_per_run === 1 && p.revoked_at === null && p.status === 'active', 'principal_not_active_bounded');
  requireThat(['owner', 'admin'].includes(p.delegator_role) && p.run_count === 0, 'delegator_or_empty_fixture_unqualified');
  const created = instant(p.created_at), expiry = instant(p.expires_at), fresh = instant(options.freshAfter), observed = instant(observed_at);
  requireThat(fresh <= now && fresh >= now - 15 * 60000 && created >= fresh && created <= observed && Math.abs(now - observed) <= 60000, 'scope_not_fresh');
  requireThat(expiry > now + 30000 && expiry <= now + 3600000, 'expiry_not_suitable');
  return { expiry, agentId: p.id };
}

export async function observe(envelope, options, { fetchImpl = globalThis.fetch, clock = Date.now, sleep = delay, signal, onBaseline = emit } = {}) {
  const url = new URL(options.baseUrl);
  requireThat(url.origin === STAGING_ORIGIN && !url.username && !url.password && !url.search && !url.hash && ['/', '/api/v1', '/api/v1/'].includes(url.pathname), 'invalid_staging_url');
  requireThat(options.ack === 'authorized-staging-read-only' && [options.org, options.context, options.assignee].every(id), 'missing_staging_scope_ack');
  requireThat(Number.isInteger(options.waitSeconds) && options.waitSeconds >= 1 && options.waitSeconds <= 600, 'invalid_wait_bound');
  const { expiry, agentId } = inspectScope(envelope, options, clock());
  const end = Math.min(clock() + options.waitSeconds * 1000, expiry - 10000);
  const { LensLayerClient, LensLayerHttpError, sourceHashes } = await loadSDK();
  let lastHTTP;
  const client = new LensLayerClient({ baseUrl: url.href, token: envelope.token, maxRetries: 0, requestTimeoutMs: 5000,
    fetch: async (target, init) => {
      requireThat(target === `${url.origin}/api/v1/agent/tools` && init.method === 'GET' && !init.body && init.redirect === 'manual', 'non_read_request_blocked');
      requireThat(clock() < end, 'observation_deadline');
      const result = await fetchImpl(target, init);
      const serverTime = Date.parse(result.headers.get('date'));
      requireThat(Number.isFinite(serverTime) && Math.abs(serverTime - clock()) <= 5000, 'server_clock_unqualified');
      lastHTTP = { status: result.status, serverTime };
      return boundedResponse(result, init.signal);
    },
  });
  try {
    const tools = await client.tools({ signal });
    requireThat(lastHTTP.status === 200 && exact(tools.map((t) => t.name), TOOLS) && tools.every((t) => t.version === '1' && t.requires_approval === (t.name === TOOLS[1])), 'baseline_not_positive_exact');
    const baselineAt = clock();
    onBaseline({ phase: 'baseline_positive', observed_at: new Date(baselineAt).toISOString(), agent_id: agentId, owner_next_step: 'Revoke ONLY this new credential in the existing owner UI now. Observer continues automatically.' });
    let polls = 0;
    while (clock() < end) {
      signal?.throwIfAborted();
      await sleep(Math.min(1000, Math.max(1, end - clock())), undefined, { signal });
      if (clock() >= end) break;
      polls++;
      try { await client.tools({ signal }); }
      catch (error) {
        if (!(error instanceof LensLayerHttpError) || ![401, 403].includes(error.status)) throw error;
        const observed = clock();
        requireThat(observed > baselineAt && observed < expiry - 5000 && lastHTTP.serverTime < expiry - 5000, 'denial_not_pre_expiry');
        return { complete: true, sdk_denial_observed: true, status: error.status, agent_id: agentId,
          baseline_at: new Date(baselineAt).toISOString(), denied_at: new Date(observed).toISOString(),
          server_date: new Date(lastHTTP.serverTime).toISOString(), expires_at: new Date(expiry).toISOString(), polls,
          scope_source: 'owner_read_only_snapshot_sha256_bound', owner_revocation_metadata_still_required: true,
          sdk_source_sha256: sourceHashes, node_version: process.versions.node,
          writes_performed: false, completed_graph_repeated: false };
      }
    }
    requireThat(false, 'no_denial_within_pre_expiry_bound');
  } finally { envelope.token = ''; }
}

if (isMain(import.meta.url)) {
  let envelope;
  let stops;
  try {
    const { values: v } = parseArgs({ options: { 'base-url': { type: 'string' }, org: { type: 'string' }, context: { type: 'string' }, assignee: { type: 'string' }, 'fresh-after': { type: 'string' }, ack: { type: 'string' }, 'wait-seconds': { type: 'string', default: '180' } } });
    envelope = await hiddenJSON();
    stops = stopSignals();
    emit(await observe(envelope, { baseUrl: v['base-url'], org: v.org, context: v.context, assignee: v.assignee, freshAfter: v['fresh-after'], waitSeconds: Number(v['wait-seconds']), ack: v.ack }, { signal: stops.signal }));
  } catch (error) { failClosed(error); }
  finally { if (envelope) envelope.token = ''; stops?.close(); }
}
