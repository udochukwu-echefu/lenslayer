export class LensLayerHttpError extends Error {
  readonly name = "LensLayerHttpError";
  constructor(message: string, readonly status: number, readonly detail: unknown, readonly requestId: string | null) {
    super(message);
  }
}

export class LensLayerTransportError extends Error {
  readonly name = "LensLayerTransportError";
  constructor() {
    // Do not preserve a fetch exception that may contain credentials or headers.
    super("LensLayer could not be reached. Check the server URL and retry only with the same mutation input and idempotency key.");
  }
}

export class LensLayerProtocolError extends Error {
  readonly name = "LensLayerProtocolError";
}

export class PollingStoppedError extends Error {
  readonly name = "PollingStoppedError";
  constructor(readonly reason: "timeout" | "deadline", readonly runId: string) {
    super(reason === "deadline" ? "The run deadline elapsed; polling stopped. This is not a verified outcome." : "The polling time limit elapsed. The run may still be waiting for approval or execution.");
  }
}

export function redact(value: unknown, token: string): unknown {
  if (typeof value === "string") return value.split(token).join("[redacted]").replace(/ll_agent_[A-Za-z0-9_-]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  if (Array.isArray(value)) return value.map((item) => redact(item, token));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [redact(key, token) as string, /token|authorization|secret/i.test(key) ? "[redacted]" : redact(item, token)]));
  return value;
}

export function httpMessage(detail: unknown, status: number): string {
  const value = detail && typeof detail === "object" && "detail" in detail ? detail.detail : detail;
  if (typeof value === "string" && value.trim() && !value.trim().startsWith("<")) return value.slice(0, 2000);
  if (Array.isArray(value)) {
    const messages = value.flatMap((issue: unknown) => issue && typeof issue === "object" && "msg" in issue && typeof issue.msg === "string" ? [issue.msg] : []);
    if (messages.length) return messages.join("; ").slice(0, 2000);
  }
  return `LensLayer request failed (${status}).`;
}
