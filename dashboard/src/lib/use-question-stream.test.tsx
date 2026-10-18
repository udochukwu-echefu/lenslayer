import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { streamQuestion, type QAAnswer, type QAEvent } from "./api/qa-stream";
import { useQuestionStream } from "./use-question-stream";

vi.mock("./api/qa-stream", () => ({ streamQuestion: vi.fn() }));
const final: QAAnswer = { answer: "Synthetic [Source 1]", sources: [], generated_by: "extractive" };
let calls: Array<{ signal: AbortSignal; emit: (event: QAEvent) => void; finish: (answer: QAAnswer) => void }>;
beforeEach(() => {
  calls = [];
  vi.mocked(streamQuestion).mockImplementation((_path, _question, emit, signal) => new Promise((finish) => {
    calls.push({ signal, emit, finish: finish as (answer: QAAnswer) => void });
  }));
});

it("exposes provisional content, but only a final result becomes completed data", async () => {
  const { result } = renderHook(() => useQuestionStream("/organizations/one/portfolio/questions", false));
  act(() => result.current.mutate("Synthetic question"));
  act(() => calls[0].emit({ type: "answer", delta: "Provisional", request_id: "r", seq: 1 }));
  expect(result.current.partial).toBe("Provisional"); expect(result.current.data).toBeUndefined();
  await act(async () => calls[0].finish(final));
  expect(result.current.data).toEqual(final); expect(result.current.partial).toBeUndefined();
});

it("cancels waiting work immediately and ignores a late provider completion", async () => {
  const { result } = renderHook(() => useQuestionStream("/organizations/one/portfolio/questions", false));
  act(() => result.current.mutate("Synthetic question"));
  act(() => result.current.cancel());
  expect(calls[0].signal.aborted).toBe(true); expect(result.current.isPending).toBe(false);
  await act(async () => calls[0].finish(final));
  expect(result.current.data).toBeUndefined(); expect(result.current.error?.message).toContain("not a completed answer");
});

it("clears visible content and aborts an old workspace when scope changes", async () => {
  const { result, rerender } = renderHook(({ path }) => useQuestionStream(path, false), { initialProps: { path: "/organizations/one/portfolio/questions" } });
  act(() => result.current.mutate("Synthetic question"));
  act(() => calls[0].emit({ type: "answer", delta: "Old scope", request_id: "r", seq: 1 }));
  rerender({ path: "/organizations/two/portfolio/questions" });
  expect(calls[0].signal.aborted).toBe(true); expect(result.current.partial).toBeUndefined();
  await act(async () => calls[0].finish(final));
  expect(result.current.data).toBeUndefined();
});
