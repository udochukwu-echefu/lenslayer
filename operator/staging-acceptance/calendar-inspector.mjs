import { createHash } from 'node:crypto';
import { boundedResponse, emit, failClosed, hiddenJSON, instant, isMain, requireThat, stopSignals } from './io.mjs';

export const CONNECTION = '75a57c6d-2b10-4b25-9a4c-a96658ff4abe';
export const OLD_CONNECTION = 'a3208ad4-3427-4acf-9946-4ac4298b6bcb';
export const EVENT = 'llaff707c0c9064758bda6e85905917737';
export const CALENDAR_HASH = '45f237882d5ad10dd8349206d05e16d7fa54f37ceeb97b89da6ef48c2eab55d1';

export function checkTarget(calendar, expected) {
  requireThat(typeof calendar === 'string' && createHash('sha256').update(calendar).digest('hex') === CALENDAR_HASH, 'wrong_disposable_calendar');
  requireThat(expected?.id === EVENT && expected.visibility === 'private' && expected.status === 'confirmed' && typeof expected.description === 'string', 'invalid_original_intent');
  const provenance = expected.extendedProperties?.private;
  requireThat(provenance?.lenslayer_connection === OLD_CONNECTION && provenance.lenslayer_calendar === CALENDAR_HASH && provenance.lenslayer_run === 'ee06a0a5-208d-422f-a147-c1417471cca5' && provenance.lenslayer_action === '96e786d7-74f1-4f4c-82be-c4f9b5e95377' && provenance.lenslayer_input === '850e803ffdde52e0a48ac9d40481cc8c5faedb34f742771b956c466cf599d176', 'wrong_original_provenance');
  requireThat(expected.summary === '[STAGING SYNTHETIC] Private Calendar acceptance — 15 Oct 2026' && instant(expected.start?.dateTime) === Date.parse('2026-10-15T09:00:00Z') && instant(expected.end?.dateTime) === Date.parse('2026-10-15T09:15:00Z'), 'wrong_original_fields');
  requireThat(expected.reminders?.useDefault === false && Object.keys(expected.reminders).length === 1, 'wrong_original_reminders');
}

const equal = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
};

export function checkEvent(actual, expected) {
  requireThat(actual?.id === expected.id && actual.status === 'confirmed' && actual.summary === expected.summary && (actual.description ?? '') === expected.description && actual.visibility === 'private' && equal(actual.reminders, expected.reminders) && equal(actual.extendedProperties?.private, expected.extendedProperties.private), 'event_fields_differ');
  requireThat(['start', 'end'].every((key) => instant(actual[key]?.dateTime) === instant(expected[key].dateTime)), 'event_times_differ');
  requireThat(['attendees', 'recurrence', 'attachments'].every((key) => !actual[key] || (Array.isArray(actual[key]) && actual[key].length === 0)) && !actual.conferenceData && !actual.hangoutLink, 'unexpected_event_side_fields');
}

export async function inspectIndependent(envelope, { fetchImpl = globalThis.fetch, signal } = {}) {
  const { token, calendar_id: calendar, expected } = envelope;
  requireThat(envelope.ack === 'existing-independent-read-only-grant', 'existing_inspector_authority_required');
  requireThat(typeof token === 'string' && /^[A-Za-z0-9._~+\/-]{10,4096}$/.test(token) && !token.startsWith('ll_agent_'), 'invalid_inspector_bearer');
  checkTarget(calendar, expected);
  const base = 'https://www.googleapis.com/calendar/v3/';
  const target = encodeURIComponent(calendar);
  const get = async (path) => {
    const bound = AbortSignal.timeout(5000);
    const combined = signal ? AbortSignal.any([signal, bound]) : bound;
    const response = await boundedResponse(await fetchImpl(base + path, { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, redirect: 'manual', cache: 'no-store', signal: combined }), combined);
    requireThat(response.status === 200, 'inspector_get_rejected');
    const value = await response.json();
    requireThat(value && typeof value === 'object' && !Array.isArray(value), 'inspector_response_invalid');
    return value;
  };
  try {
    const listing = await get('users/me/calendarList/' + target);
    requireThat(listing.id === calendar && listing.accessRole === 'owner' && [undefined, false].includes(listing.primary) && [undefined, false].includes(listing.deleted), 'calendar_not_owned_secondary');
    checkEvent(await get(`calendars/${target}/events/${EVENT}`), expected);
    const events = await get(`calendars/${target}/events?maxResults=2&showDeleted=false&singleEvents=false`);
    requireThat(Array.isArray(events.items) && events.items.length === 1 && events.items[0]?.id === EVENT && !events.nextPageToken, 'single_event_not_proved');
    return { complete: true, independent_api_fields_verified: true, owned_secondary_verified: true, exactly_one_event_verified: true,
      renewed_product_grant_qualified: false, same_google_account_subject_proved: false,
      inspector_project_and_scopes_require_external_evidence: true, production_session_binding_verified: false,
      source_of_expected_fields: 'owner_supplied_original_durable_dispatch_intent', writes_performed: false };
  } finally { envelope.token = ''; }
}

if (isMain(import.meta.url)) {
  let envelope, stops;
  try {
    requireThat(process.argv.length === 2, 'no_token_arguments_allowed');
    envelope = await hiddenJSON();
    stops = stopSignals();
    emit(await inspectIndependent(envelope, { signal: stops.signal }));
  } catch (error) { failClosed(error); }
  finally { if (envelope) envelope.token = ''; stops?.close(); }
}
