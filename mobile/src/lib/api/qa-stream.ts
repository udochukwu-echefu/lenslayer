import { fetch as streamingFetch } from "expo/fetch";
import { config } from "../config";
import { ApiError, buildHeaders, failure, jsonRequest } from "./client";
import { applyFrame, QAStreamError, type QAAnswer, type QAEvent } from "./qa-frame";

export type { QAAnswer, QAEvent, QASource } from "./qa-frame";

/**
 * Streamed, evidence-grounded answers. Port of dashboard/src/lib/api/qa-stream.ts.
 *
 * The backend writes NDJSON frames (status → evidence → answer deltas → final).
 * Partial text is provisional; only a `final` frame with completed=true and
 * valid citations counts as an answer. The validation rules are unchanged from
 * the web client so both apps refuse the same malformed streams.
 */
/** Asks a question at `path` (…/questions). Streams when the runtime supports it. */
export async function streamQuestion(path: string, question: string, onEvent: (event: QAEvent) => void, signal: AbortSignal): Promise<QAAnswer> {
  signal.throwIfAborted();
  // Without a streaming body reader, fall back to the non-streaming endpoint.
  if (typeof TextDecoder === "undefined") return jsonRequest<QAAnswer>(path, "POST", { question }, signal);
  const headers = await buildHeaders(`${path}/stream`, { method: "POST" });
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/x-ndjson");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new QAStreamError("timeout")), 135_000);
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  try {
    const response = await streamingFetch(`${config.apiPrefix}${path}/stream`, {
      method: "POST", headers: Object.fromEntries(headers.entries()), body: JSON.stringify({ question }), signal: controller.signal,
    });
    if (!response.ok) throw await failure(response as unknown as Response, `${path}/stream`, "POST");
    if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body) throw new QAStreamError();
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const state = { requestId: "", sequence: 0 };
    let buffer = "";
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (value) bytes += value.byteLength;
      if (bytes > 512_000) throw new QAStreamError();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const result = applyFrame(line, state, onEvent);
        if (result) { void reader.cancel().catch(() => {}); return result; }
      }
      if (buffer.length > 64_000) throw new QAStreamError();
      if (done) throw new QAStreamError();
    }
  } catch (error) {
    if (signal.aborted) throw new DOMException("Answer cancelled.", "AbortError");
    if (controller.signal.reason instanceof QAStreamError) throw controller.signal.reason;
    if (error instanceof QAStreamError || error instanceof ApiError) throw error;
    throw new QAStreamError();
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
