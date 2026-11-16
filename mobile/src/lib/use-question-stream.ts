import { useEffect, useRef, useState } from "react";
import { streamQuestion, type QAAnswer } from "./api/qa-stream";

type State = { path: string; data?: QAAnswer; evidence?: QAAnswer["sources"]; partial?: string; error?: Error; isPending: boolean };

/**
 * UI state for one question at a time. A new question or leaving the screen
 * aborts the previous stream, and an aborted stream can never repopulate the
 * screen (port of dashboard/src/lib/use-question-stream.ts).
 */
export function useQuestionStream(path: string) {
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({ path, isPending: false });
  useEffect(() => () => { controller.current?.abort(); }, [path]);
  const visible: State = state.path === path ? state : { path, isPending: false };

  function ask(question: string) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ path, isPending: true });
    const active = () => !abort.signal.aborted && controller.current === abort;
    void streamQuestion(path, question, (event) => {
      if (active() && event.type === "answer") setState((current) => ({ ...current, partial: (current.partial ?? "") + event.delta }));
      if (active() && event.type === "evidence") setState((current) => ({ ...current, evidence: event.sources }));
    }, abort.signal).then((data) => {
      if (active()) setState({ path, data, isPending: false });
    }).catch((cause) => {
      if (active()) setState((current) => ({ ...current, isPending: false, error: cause instanceof Error ? cause : new Error("Answer incomplete.") }));
    });
  }

  function cancel() {
    controller.current?.abort();
    setState((current) => ({ ...current, isPending: false, error: new Error("Answer stopped. Partial text is not a completed answer.") }));
  }

  function reset() {
    controller.current?.abort();
    setState({ path, isPending: false });
  }

  return { ...visible, ask, cancel, reset };
}
