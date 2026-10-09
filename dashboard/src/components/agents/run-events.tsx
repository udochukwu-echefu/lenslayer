"use client";

import { exactDateTime } from "@/lib/agent-state";
import type { RunEvent } from "@/lib/agent-types";

const eventLabels: Record<string, string> = {
  "run.created": "Run created", "evidence.retrieved": "Source evidence retrieved", "action.proposed": "Task proposal recorded",
  "action.approved": "Human approval recorded", "action.rejected": "Human rejection recorded", "action.succeeded": "Task created and verified",
  "action.failed": "Task execution failed", "run.succeeded": "Success condition verified", "run.failed": "Run failed", "run.cancelled": "Run cancelled",
};

export function RunEvents({ events, hasMore, loadingMore, loadMore }: { events: RunEvent[]; hasMore: boolean; loadingMore: boolean; loadMore: () => void }) {
  return <section className="agent-events" aria-labelledby="events-heading">
    <div className="section-heading"><h2 id="events-heading">Ordered events</h2><p>{events.length} loaded</p></div>
    {events.length ? <ol>{events.map((event) => <li key={event.sequence}><span className="agent-event-sequence" aria-label={`Sequence ${event.sequence}`}>{event.sequence}</span><div><h3>{eventLabels[event.type] ?? event.type}</h3><p><time dateTime={event.created_at}>{exactDateTime(event.created_at)}</time><code>{event.type}</code></p>{Object.keys(event.data).length > 0 && <details><summary>Event data</summary><pre>{JSON.stringify(event.data, null, 2)}</pre></details>}</div></li>)}</ol> : <p className="agent-footnote">No events have been recorded for this run.</p>}
    {hasMore && <button type="button" className="button secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? "Loading events…" : "Load more events"}</button>}
    <p className="field-help">Sequence numbers define order. Event pages may overlap during refresh; duplicate sequences are displayed once.</p>
  </section>;
}
