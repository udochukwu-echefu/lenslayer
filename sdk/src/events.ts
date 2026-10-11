import { LensLayerProtocolError } from "./errors.js";
import { boundedInteger } from "./transport.js";
import type { EventOptions, RunEvent } from "./types.js";

export interface IterateEventsOptions extends EventOptions { maxPages?: number }

export async function* iterateEvents(
  page: (options: EventOptions) => Promise<RunEvent[]>,
  options: IterateEventsOptions = {},
): AsyncGenerator<RunEvent> {
  let cursor = boundedInteger(options.afterSequence ?? 0, "afterSequence", 0, Number.MAX_SAFE_INTEGER);
  const limit = boundedInteger(options.limit ?? 100, "limit", 1, 200);
  const maxPages = boundedInteger(options.maxPages ?? 100, "maxPages", 1, 10000);
  for (let index = 0; index < maxPages; index++) {
    const events = await page({ ...options, afterSequence: cursor, limit });
    const previous = cursor;
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      if (event.sequence <= cursor) continue;
      cursor = event.sequence;
      yield event;
    }
    if (events.length < limit) return;
    if (cursor <= previous) throw new LensLayerProtocolError("Event pagination did not advance its sequence cursor.");
  }
  throw new LensLayerProtocolError("Event pagination reached maxPages. Resume using the last received sequence.");
}
