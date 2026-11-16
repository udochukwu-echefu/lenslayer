import { fetch as streamingFetch } from "expo/fetch";
import { config } from "../config";
import { ApiError, buildHeaders, failure, jsonRequest } from "./client";

/**
 * Streamed, evidence-grounded answers. Port of dashboard/src/lib/api/qa-stream.ts.
 *
 * The backend writes NDJSON frames (status → evidence → answer deltas → final).
 * Partial text is provisional; only a `final` frame with completed=true and
 * valid citations counts as an answer. The validation rules are unchanged from
 * the web client so both apps refuse the same malformed streams.
 */
const failureMessages = {
  provider_incomplete: "The answer provider did not finish. Any partial answer is incomplete. Please try again.",
  citation_invalid: "The answer contains invalid source citations. Any partial answer is incomplete. Please try again.",
  evidence_or_access_changed: "Evidence or access changed while answering. Any partial answer is incomplete. Please try again.",
  timeout: "The answer timed out. Any partial answer is incomplete. Please try again.",
  finalization_failed: "The answer could not be finalized. Any partial answer is incomplete. Please try again.",
  generation_failed: "Answer generation failed. Any partial answer is incomplete. Please try again.",
} as const;
export type QAStreamErrorCode = keyof typeof failureMessages;
const genericFailure = "Answer incomplete. Please try again.";
const validRequestId = (value: unknown): value is string => typeof value === "string" && value.trim() === value && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);

export class QAStreamError extends Error {
  readonly code?: QAStreamErrorCode;
  constructor(code?: unknown) {
    const safeCode = typeof code === "string" && Object.hasOwn(failureMessages, code) ? (code as QAStreamErrorCode) : undefined;
    super(safeCode ? failureMessages[safeCode] : genericFailure);
    this.name = "QAStreamError";
    this.code = safeCode;
  }
}

export type QASource = { location: string; excerpt: string; label?: string; contract_id?: string; contract_title?: string };
export type QAAnswer = { answer: string; sources: QASource[]; generated_by: "model" | "extractive" };
export type QAEvent = {
  type: "status" | "evidence" | "answer" | "error" | "final";
  request_id: string;
  seq: number;
  provisional?: boolean;
  delta?: string;
  sources?: QASource[];
  completed?: boolean;
  result?: QAAnswer;
  code?: QAStreamErrorCode;
};

export function validSources(sources: unknown): sources is QASource[] {
  return Array.isArray(sources) && sources.length <= 8 && sources.every((source) => source &&
    typeof source.location === "string" && typeof source.excerpt === "string" &&
    ["label", "contract_id", "contract_title"].every((field) => source[field] == null || typeof source[field] === "string"));
}

export function validAnswer(value: unknown): value is QAAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as QAAnswer;
  return typeof answer.answer === "string" && ["model", "extractive"].includes(answer.generated_by) && validSources(answer.sources);
}

/**
 * Applies one NDJSON line to the stream state. Pure, so it can be unit tested
 * without a network. Returns the final answer when the stream completes.
 */
export function applyFrame(line: string, state: { requestId: string; sequence: number }, onEvent: (event: QAEvent) => void): QAAnswer | null {
  if (line.length > 64_000) throw new QAStreamError();
  const event = JSON.parse(line) as QAEvent;
  if (!event || !validRequestId(event.request_id) || !Number.isSafeInteger(event.seq) || event.seq !== state.sequence + 1 ||
      !["status", "evidence", "answer", "error", "final"].includes(event.type)) throw new QAStreamError();
  if (state.requestId && event.request_id !== state.requestId) throw new QAStreamError();
  state.requestId = event.request_id;
  state.sequence = event.seq;
  if (event.type === "error") throw new QAStreamError(event.code);
  if (event.type === "answer" && (typeof event.delta !== "string" || event.provisional !== true)) throw new QAStreamError();
  if (event.type === "evidence" && !validSources(event.sources)) throw new QAStreamError();
  if (event.type === "final") {
    if (event.completed === false) throw new QAStreamError(event.code);
    if (event.completed !== true || event.provisional !== false || !validAnswer(event.result)) throw new QAStreamError();
    onEvent(event);
    return event.result;
  }
  onEvent(event);
  return null;
}

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
