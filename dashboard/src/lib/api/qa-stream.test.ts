import { afterEach, describe, expect, it, vi } from "vitest";
import { readQAStream, streamQuestion, type QAEvent } from "./qa-stream";
import { request, resolveAuthenticatedSession } from "./client";
vi.mock("./client", () => ({
  API_PREFIX: "/api/platform/api/v1", ApiError: class extends Error {}, request: vi.fn(), resolveAuthenticatedSession: vi.fn().mockResolvedValue({}),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const answer = { answer: "Café 🙂 [Source 1]", sources: [{ label: "Source 1", location: "Page 1", excerpt: "Synthetic notice" }], generated_by: "model" };
const frame = (seq: number, type: string, data = {}) => JSON.stringify({ seq, request_id: "request-a", type, ...data }) + "\n";
const final = () => frame(3, "final", { completed: true, provisional: false, result: answer });
const response = (body: ReadableStream<Uint8Array>) => new Response(body, { headers: { "content-type": "application/x-ndjson" } });

describe("incremental private Q&A transport", () => {
  it("handles every UTF-8 byte/chunk boundary, multiple frames and early content before final", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const events: QAEvent[] = [];
    let first!: () => void;
    const firstContent = new Promise<void>((resolve) => { first = resolve; });
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    let complete = false;
    const result = readQAStream(response(stream), (event) => { events.push(event); if (event.type === "answer") first(); }).then((value) => { complete = true; return value; });
    const bytes = new TextEncoder().encode(frame(1, "status") + frame(2, "answer", { delta: answer.answer, provisional: true }));
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    await firstContent;
    expect(events[1].delta).toBe(answer.answer);
    expect(complete).toBe(false);
    controller.enqueue(new TextEncoder().encode(final()));
    controller.close();
    expect(await result).toEqual(answer);
  });

  it.each([
    ["missing final", frame(1, "status")],
    ["truncated frame", '{"request_id":'],
    ["partial error", frame(1, "answer", { delta: "partial", provisional: true }) + frame(2, "error")],
    ["failed final", frame(1, "final", { completed: false, provisional: true })],
    ["switched identity", frame(1, "status") + JSON.stringify({ seq: 2, request_id: "other", type: "status" }) + "\n"],
    ["out of order", frame(2, "status")],
    ["unvalidated final", frame(1, "final", { completed: true, provisional: false, result: { answer: "bad" } })],
  ])("rejects %s instead of returning a completed answer", async (_name, text) => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } });
    await expect(readQAStream(response(stream), () => {})).rejects.toThrow();
  });

  it("cancels a pending reader immediately on abort, even before the next chunk", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const pending = readQAStream(response(stream), () => {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("retains CSRF, no-store, BFF routing and the same signal; demo never opens a stream", async () => {
    const abort = new AbortController();
    const fetcher = vi.fn().mockResolvedValue(response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(frame(1, "status") + frame(2, "evidence", { sources: answer.sources }) + final())); controller.close();
    } })));
    vi.stubGlobal("fetch", fetcher);
    await streamQuestion("/organizations/org/portfolio/questions", "notice", () => {}, abort.signal);
    expect(resolveAuthenticatedSession).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/platform/api/v1/organizations/org/portfolio/questions/stream", expect.objectContaining({
      signal: expect.any(AbortSignal), cache: "no-store", headers: expect.objectContaining({ "X-LensLayer-Platform-CSRF": "1" }),
    }));
    vi.mocked(request).mockResolvedValue(answer);
    await expect(streamQuestion("/organizations/demo/portfolio/questions", "notice", () => {}, abort.signal, true)).resolves.toEqual(answer);
    expect(fetcher).toHaveBeenCalledOnce();
    abort.abort();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
