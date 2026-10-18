import { API_PREFIX, ApiError, request, resolveAuthenticatedSession } from "./client";

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

/** Retains no server message, raw frame, exception, or unrecognized code. */
export class QAStreamError extends Error {
  readonly code?: QAStreamErrorCode;
  readonly requestId?: string;
  readonly seq?: number;
  readonly completed = false;

  constructor(code?: unknown, requestId?: unknown, seq?: unknown) {
    const safeCode = typeof code === "string" && Object.hasOwn(failureMessages, code) ? code as QAStreamErrorCode : undefined;
    super(safeCode ? failureMessages[safeCode] : genericFailure);
    this.name = "QAStreamError";
    this.code = safeCode;
    if (validRequestId(requestId)) this.requestId = requestId;
    if (typeof seq === "number" && Number.isSafeInteger(seq) && seq > 0) this.seq = seq;
  }
}

export type QAAnswer = {
  answer: string;
  sources: Array<{ location: string; excerpt: string; label?: string; contract_id?: string; contract_title?: string }>;
  generated_by: "model" | "extractive";
};
export type QAEvent = {
  type: "status" | "evidence" | "answer" | "error" | "final";
  request_id: string;
  seq: number;
  provisional?: boolean;
  delta?: string;
  sources?: QAAnswer["sources"];
  completed?: boolean;
  result?: QAAnswer;
  code?: QAStreamErrorCode;
};

function validAnswer(value: unknown): value is QAAnswer {
  if (!value || typeof value !== "object") return false;
  const answer = value as QAAnswer;
  return typeof answer.answer === "string" && ["model", "extractive"].includes(answer.generated_by) &&
    validSources(answer.sources);
}

function validSources(sources: unknown): sources is QAAnswer["sources"] {
  return Array.isArray(sources) && sources.length <= 8 && sources.every((source) => source &&
    typeof source.location === "string" && typeof source.excerpt === "string" &&
    ["label", "contract_id", "contract_title"].every((field) => source[field] == null || typeof source[field] === "string"));
}

/** NDJSON is decoded incrementally, never by splitting raw UTF-8 byte chunks. */
export async function readQAStream<T extends QAAnswer>(response: Response, onEvent: (event: QAEvent) => void, signal?: AbortSignal): Promise<T> {
  if (!response.ok) throw new ApiError(`Answer unavailable (${response.status}).`, response.status);
  if (!response.headers.get("content-type")?.includes("application/x-ndjson") || !response.body)
    throw new QAStreamError();
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let requestId = "";
  let sequence = 0;
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      signal?.throwIfAborted();
      if (value) bytes += value.byteLength;
      if (bytes > 512_000) throw new Error("Answer stream exceeded its limit.");
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        if (line.length > 64_000) throw new Error("Invalid answer frame.");
        const event: QAEvent = JSON.parse(line);
        if (!event || !validRequestId(event.request_id) || !Number.isSafeInteger(event.seq) ||
            event.seq !== sequence + 1 || !["status", "evidence", "answer", "error", "final"].includes(event.type))
          throw new Error("Invalid answer stream.");
        if (requestId && event.request_id !== requestId) throw new Error("Answer identity changed.");
        requestId = event.request_id;
        sequence = event.seq;
        if (event.type === "error") throw new QAStreamError(event.code, requestId, sequence);
        if (event.type === "answer" && (typeof event.delta !== "string" || event.provisional !== true))
          throw new Error("Invalid provisional answer.");
        if (event.type === "evidence" && !validSources(event.sources)) throw new Error("Invalid evidence frame.");
        if (event.type === "final") {
          if (event.completed === false) throw new QAStreamError(event.code, requestId, sequence);
          if (event.completed !== true || event.provisional !== false || !validAnswer(event.result))
            throw new QAStreamError(undefined, requestId, sequence);
          onEvent(event);
          return event.result as T;
        }
        onEvent(event);
      }
      if (buffer.length > 64_000) throw new Error("Invalid answer frame.");
      if (done) throw new Error("Answer interrupted before completion. Please try again.");
    }
  } catch (error) {
    if (signal?.aborted) {
      if (signal.reason?.name === "TimeoutError") throw new QAStreamError("timeout", requestId, sequence);
      throw new DOMException("Answer cancelled.", "AbortError");
    }
    if (error instanceof QAStreamError) throw error;
    throw new QAStreamError(undefined, requestId, sequence);
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function streamQuestion<T extends QAAnswer>(
  path: string, question: string, onEvent: (event: QAEvent) => void, signal: AbortSignal, isDemo = false,
): Promise<T> {
  if (signal.aborted) throw new DOMException("Answer cancelled.", "AbortError");
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(135_000)]);
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }), signal: deadline };
  if (isDemo) return request<T>(path, init, true);
  try {
    // getSession itself has no cancellation API; stop waiting locally on abort.
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(deadline.reason);
      deadline.addEventListener("abort", abort, { once: true });
      resolveAuthenticatedSession().then(() => resolve(), reject).finally(() => deadline.removeEventListener("abort", abort));
      if (deadline.aborted) abort();
    });
    deadline.throwIfAborted();
    const response = await fetch(`${API_PREFIX}${path}/stream`, {
      ...init, headers: { ...init.headers, "X-LensLayer-Platform-CSRF": "1", Accept: "application/x-ndjson" }, cache: "no-store",
    });
    return await readQAStream<T>(response, onEvent, deadline);
  } catch (error) {
    if (error instanceof QAStreamError || error instanceof ApiError) throw error;
    if (deadline.aborted) {
      if (!signal.aborted) throw new QAStreamError("timeout");
      throw new DOMException("Answer cancelled.", "AbortError");
    }
    throw new QAStreamError();
  }
}
