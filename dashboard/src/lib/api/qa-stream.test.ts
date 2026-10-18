import { afterEach, describe, expect, it, vi } from "vitest";
import { QAStreamError, readQAStream, streamQuestion, type QAEvent } from "./qa-stream";
import { ApiError, request, resolveAuthenticatedSession } from "./client";
vi.mock("./client", () => ({
  API_PREFIX: "/api/platform/api/v1", ApiError: class extends Error {}, request: vi.fn(), resolveAuthenticatedSession: vi.fn().mockResolvedValue({}),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const answer = { answer: "Café 🙂 [Source 1]", sources: [{ label: "Source 1", location: "Page 1", excerpt: "Synthetic notice" }], generated_by: "model" };
const frame = (seq: number, type: string, data = {}) => JSON.stringify({ seq, request_id: "request-a", type, ...data }) + "\n";
const final = () => frame(3, "final", { completed: true, provisional: false, result: answer });
const response = (body: ReadableStream<Uint8Array>) => new Response(body, { headers: { "content-type": "application/x-ndjson" } });
const textResponse = (text: string) => response(new ReadableStream({ start(controller) {
  controller.enqueue(new TextEncoder().encode(text)); controller.close();
} }));

describe("incremental private Q&A transport", () => {
  it.each([
    ["provider_incomplete", "provider did not finish"],
    ["citation_invalid", "invalid source citations"],
    ["evidence_or_access_changed", "Evidence or access changed"],
    ["timeout", "timed out"],
    ["finalization_failed", "could not be finalized"],
    ["generation_failed", "generation failed"],
  ])("preserves validated %s diagnostics without trusting server messages", async (code, message) => {
    const events: QAEvent[] = [];
    const error = await readQAStream(textResponse(
      frame(1, "answer", { delta: "Partial answer", provisional: true }) +
      frame(2, "error", { code, completed: false, message: "synthetic-secret <script>unsafe</script>", detail: "private" }),
    ), (event) => events.push(event)).catch((value) => value);
    expect(error).toBeInstanceOf(QAStreamError);
    expect(error).toMatchObject({ code, requestId: "request-a", seq: 2, completed: false });
    expect(error.message).toContain(message);
    expect(error.message).toContain("incomplete");
    expect(JSON.stringify(error)).not.toMatch(/synthetic-secret|unsafe|private/);
    expect(error.message).not.toContain("synthetic-secret");
    expect(error.cause).toBeUndefined();
    expect(events).toEqual([{ type: "answer", request_id: "request-a", seq: 1, delta: "Partial answer", provisional: true }]);
  });

  it.each([undefined, "unknown-secret-code", "__proto__", "constructor", { message: "private" }])("keeps missing/unknown codes generic (%j)", async (code) => {
    await expect(readQAStream(textResponse(frame(1, "error", { code, message: "private" })), () => {}))
      .rejects.toMatchObject({ name: "QAStreamError", code: undefined, message: "Answer incomplete. Please try again.", requestId: "request-a", seq: 1, completed: false });
  });

  it("treats completed:false as failure even with a plausible result and later success", async () => {
    const onEvent = vi.fn();
    await expect(readQAStream(textResponse(frame(1, "final", {
      completed: false, provisional: false, result: answer, code: "finalization_failed", message: "private",
    }) + final()), onEvent)).rejects.toMatchObject({ code: "finalization_failed", requestId: "request-a", seq: 1, completed: false });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it.each([
    { request_id: "other", seq: 2 },
    { request_id: "unsafe <private>", seq: 2 },
    { request_id: "request-a\n", seq: 2 },
    { request_id: "a".repeat(129), seq: 2 },
    { request_id: "request-a", seq: 4 },
    { request_id: "request-a", seq: 1.5 },
  ])("does not retain metadata or codes from an invalid frame: %j", async (metadata) => {
    await expect(readQAStream(textResponse(frame(1, "status") + frame(2, "error", {
      ...metadata, code: "citation_invalid",
    })), () => {})).rejects.toMatchObject({ code: undefined, requestId: "request-a", seq: 1 });
  });

  it("keeps EOF incomplete and sanitizes raw parser and reader exceptions", async () => {
    await expect(readQAStream(textResponse(frame(1, "answer", { delta: "partial", provisional: true })), () => {}))
      .rejects.toMatchObject({ name: "QAStreamError", completed: false, requestId: "request-a", seq: 1 });
    for (const input of [textResponse('{"private-secret": invalid}\n'), response(new ReadableStream({ start(controller) {
      controller.error(new Error("private-secret"));
    } }))]) {
      await expect(readQAStream(input, () => {})).rejects.toMatchObject({ name: "QAStreamError", message: "Answer incomplete. Please try again." });
    }
  });

  it("distinguishes deadline expiry and sanitizes custom abort reasons", async () => {
    const deadline = new AbortController();
    const pending = readQAStream(response(new ReadableStream()), () => {}, deadline.signal);
    deadline.abort(new DOMException("private-secret", "TimeoutError"));
    await expect(pending).rejects.toMatchObject({ code: "timeout", completed: false });
    const cancelled = new AbortController();
    cancelled.abort(new Error("private-secret"));
    await expect(readQAStream(textResponse(final()), () => {}, cancelled.signal))
      .rejects.toMatchObject({ name: "AbortError", message: "Answer cancelled." });
  });

  it("never exposes fetch exceptions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-secret")));
    await expect(streamQuestion("/questions", "notice", () => {}, new AbortController().signal))
      .rejects.toMatchObject({ name: "QAStreamError", message: "Answer incomplete. Please try again." });
  });

  it("preserves HTTP authentication failure handling without exposing the response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-server-detail", { status: 401 })));
    const failure = await streamQuestion("/questions", "notice", () => {}, new AbortController().signal).catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.message).toBe("Answer unavailable (401).");
    expect(failure.message).not.toContain("private-server-detail");
  });

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
