import { httpMessage, LensLayerHttpError, LensLayerProtocolError, LensLayerTransportError, redact } from "./errors.js";

export interface ClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof globalThis.fetch;
  requestTimeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export function boundedInteger(value: number, name: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Private fields keep the credential out of object inspection and serialization. */
export class AgentTransport {
  #baseUrl: string;
  #token: string;
  #fetch: typeof globalThis.fetch;
  #timeout: number;
  #retries: number;
  #delay: number;

  constructor(options: ClientOptions) {
    if (typeof window !== "undefined") throw new Error("The agent SDK is server-only. Never give an agent bearer credential to a browser.");
    const url = new URL(options.baseUrl);
    if (url.username || url.password || url.search || url.hash) throw new Error("The server URL must not contain credentials, query parameters, or a fragment.");
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Use HTTPS, or loopback HTTP for local development.");
    if (!/^ll_agent_[A-Za-z0-9_-]+$/.test(options.token) || options.token.length > 256) throw new Error("Use an ll_agent_ bearer credential, not a user JWT or public API key.");
    const base = url.toString().replace(/\/$/, "");
    this.#baseUrl = base.endsWith("/api/v1") ? base : `${base}/api/v1`;
    this.#token = options.token;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeout = boundedInteger(options.requestTimeoutMs ?? 15000, "requestTimeoutMs", 1, 120000);
    this.#retries = boundedInteger(options.maxRetries ?? 2, "maxRetries", 0, 5);
    this.#delay = boundedInteger(options.retryDelayMs ?? 250, "retryDelayMs", 0, 5000);
  }

  async request<T>(path: string, method: "GET" | "POST", payload?: unknown, signal?: AbortSignal, idempotent = false): Promise<T> {
    // Serialize once: every retry binds the exact same key and immutable input.
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const retries = method === "GET" || idempotent ? this.#retries : 0;
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try {
        const response = await this.#send(path, method, body, signal);
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < retries) {
          await response.body?.cancel().catch(() => undefined);
          await sleep(this.#retryDelay(response, attempt), signal);
          continue;
        }
        return await this.#decode<T>(response);
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof LensLayerHttpError || error instanceof LensLayerProtocolError) throw error;
        if (attempt >= retries) throw new LensLayerTransportError();
        await sleep(Math.min(5000, this.#delay * 2 ** attempt), signal);
      }
    }
  }

  async #send(path: string, method: string, body: string | undefined, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(this.#timeout);
    const headers = { Authorization: `Bearer ${this.#token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) };
    return this.#fetch(`${this.#baseUrl}${path}`, {
      method, headers, ...(body === undefined ? {} : { body }), redirect: "manual", cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  }

  #retryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    const requested = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
    return Math.min(5000, Math.max(0, this.#delay * 2 ** attempt, Number.isFinite(requested) ? requested : 0));
  }

  async #decode<T>(response: Response): Promise<T> {
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok) {
      const safe = redact(data, this.#token);
      const requestId = redact(response.headers.get("x-request-id"), this.#token) as string | null;
      throw new LensLayerHttpError(httpMessage(safe, response.status), response.status, safe, requestId);
    }
    if (!data || typeof data !== "object") throw new LensLayerProtocolError("LensLayer returned a non-JSON API response.");
    return data as T;
  }
}
