"use client";

import { useEffect, useRef, useState } from "react";
import { QAAnswer, streamQuestion } from "./api/qa-stream";

/** UI state is scoped by identity; aborted/superseded responses cannot repopulate it. */
export function useQuestionStream<T extends QAAnswer>(path: string, isDemo: boolean) {
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<{ path: string; data?: T; evidence?: T["sources"]; partial?: string; error?: Error; isPending: boolean }>({ path, isPending: false });
  useEffect(() => () => { controller.current?.abort(); }, [path]);
  const visible = state.path === path ? state : { path, isPending: false };

  function mutate(question: string) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ path, isPending: true });
    const active = () => !abort.signal.aborted && controller.current === abort;
    void streamQuestion<T>(path, question, (event) => {
      if (active() && event.type === "answer") setState((current) => ({ ...current, partial: (current.partial ?? "") + event.delta }));
      if (active() && event.type === "evidence") setState((current) => ({ ...current, evidence: event.sources as T["sources"] }));
    }, abort.signal, isDemo).then((data) => {
      if (active()) setState({ path, data, isPending: false });
    }).catch((cause) => {
      if (active()) setState((current) => ({ ...current, isPending: false, error: cause instanceof Error ? cause : new Error("Answer incomplete.") }));
    });
  }

  function cancel() {
    controller.current?.abort();
    setState((current) => ({ ...current, isPending: false, error: new Error("Answer stopped. Partial text is not a completed answer.") }));
  }
  return { ...visible, mutate, cancel };
}
