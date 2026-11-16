/** Validation for individual evidence and answer frames, independent of transport. */
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
