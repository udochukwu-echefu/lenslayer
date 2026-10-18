import { API_PREFIX, ApiError, request, resolveAuthenticatedSession } from "./client";

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
    throw new Error("The answer stream is unavailable.");
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
        if (!event || typeof event.request_id !== "string" || !event.request_id ||
            event.seq !== sequence + 1 || !["status", "evidence", "answer", "error", "final"].includes(event.type))
          throw new Error("Invalid answer stream.");
        if (requestId && event.request_id !== requestId) throw new Error("Answer identity changed.");
        requestId = event.request_id;
        sequence = event.seq;
        if (event.type === "error") throw new Error("Answer incomplete. Please try again.");
        if (event.type === "answer" && (typeof event.delta !== "string" || event.provisional !== true))
          throw new Error("Invalid provisional answer.");
        if (event.type === "evidence" && !validSources(event.sources)) throw new Error("Invalid evidence frame.");
        if (event.type === "final") {
          if (event.completed !== true || event.provisional !== false || !validAnswer(event.result))
            throw new Error("Answer incomplete. Please try again.");
          onEvent(event);
          return event.result as T;
        }
        onEvent(event);
      }
      if (buffer.length > 64_000) throw new Error("Invalid answer frame.");
      if (done) throw new Error("Answer interrupted before completion. Please try again.");
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function streamQuestion<T extends QAAnswer>(
  path: string, question: string, onEvent: (event: QAEvent) => void, signal: AbortSignal, isDemo = false,
): Promise<T> {
  signal.throwIfAborted();
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(135_000)]);
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }), signal: deadline };
  if (isDemo) return request<T>(path, init, true);
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
  return readQAStream<T>(response, onEvent, deadline);
}
