"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, BookOpen, ChevronDown, MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { PortfolioAnswer } from "@/lib/types";
import { useWorkspace } from "./workspace-provider";

type ChatMessage = { id: string; role: "viewer" | "assistant"; text: string; answer?: PortfolioAnswer };
type AssistantPhase = "idle" | "loading" | "thinking" | "streaming";

const suggestions = [
  "Which agreements renew automatically?",
  "What deadlines need attention this month?",
  "Where are liability caps missing or unclear?",
];

export function AiAssistant() {
  const { activeOrganization } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<AssistantPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamedLength, setStreamedLength] = useState(0);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const orbRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamedLengthRef = useRef(0);
  const busy = phase !== "idle";

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const orb = orbRef.current;
      if (!orb || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const bounds = orb.getBoundingClientRect();
      const x = Math.max(-2.5, Math.min(2.5, (event.clientX - (bounds.left + bounds.width / 2)) / 30));
      const y = Math.max(-2, Math.min(2, (event.clientY - (bounds.top + bounds.height / 2)) / 30));
      orb.style.setProperty("--eye-x", `${x}px`);
      orb.style.setProperty("--eye-y", `${y}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => { if (open) window.setTimeout(() => inputRef.current?.focus(), 120); }, [open]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, phase, streamedLength]);
  useEffect(() => {
    if (phase !== "loading" && phase !== "thinking") return;
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 0.1), 100);
    return () => window.clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase !== "streaming" || !streamingId) return;
    const message = messages.find((item) => item.id === streamingId);
    if (!message) return;
    const step = Math.max(1, Math.ceil(message.text.length / 120));
    const timer = window.setInterval(() => {
      const next = Math.min(message.text.length, streamedLengthRef.current + step);
      streamedLengthRef.current = next;
      setStreamedLength(next);
      if (next >= message.text.length) {
        window.clearInterval(timer);
        setPhase("idle");
        setStreamingId(null);
      }
    }, 18);
    return () => window.clearInterval(timer);
  }, [messages, phase, streamingId]);

  async function ask(value: string) {
    const text = value.trim();
    if (!text || !activeOrganization || busy) return;
    setQuestion("");
    setError("");
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "viewer", text }]);
    setElapsed(0);
    setPhase("loading");
    const thinkingTimer = window.setTimeout(() => setPhase((current) => current === "loading" ? "thinking" : current), 450);
    try {
      const answer = await api.askPortfolio(activeOrganization.id, text);
      window.clearTimeout(thinkingTimer);
      const messageId = crypto.randomUUID();
      setMessages((items) => [...items, { id: messageId, role: "assistant", text: answer.answer, answer }]);
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setPhase("idle");
      } else {
        streamedLengthRef.current = 0;
        setStreamedLength(0);
        setStreamingId(messageId);
        setPhase("streaming");
      }
    } catch (cause) {
      window.clearTimeout(thinkingTimer);
      setError(cause instanceof Error ? cause.message : "LensLayer could not retrieve an evidence-backed answer.");
      setPhase("idle");
    }
  }

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button ref={orbRef} className="ask-ai-orb" type="button" aria-label="Ask LensLayer AI"><span className="orb-face" aria-hidden="true"><i /><i /></span><span>Ask AI</span></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="ai-overlay" />
      <Dialog.Content className="ai-drawer" aria-describedby="ai-drawer-description">
        <header className="ai-drawer-head"><div className="ai-mini-orb" aria-hidden="true"><i /><i /></div><div><Dialog.Title>Ask LensLayer</Dialog.Title><Dialog.Description id="ai-drawer-description">Answers stay tied to retained contract evidence.</Dialog.Description></div><Dialog.Close asChild><button className="icon-button" aria-label="Close AI assistant"><X size={19} /></button></Dialog.Close></header>
        <div className="ai-chat" ref={scrollRef}>
          {!messages.length && <div className="ai-welcome"><BookOpen size={22} /><h2>Start with your agreements</h2><p>Ask about clauses, obligations, deadlines, or review findings. Unsupported answers are blocked.</p><div>{suggestions.map((item) => <button type="button" key={item} onClick={() => void ask(item)}>{item}</button>)}</div></div>}
          {messages.map((message) => {
            if (message.role === "viewer") return <div className="chat-message viewer" key={message.id}><span>You</span><p>{message.text}</p></div>;
            const streaming = message.id === streamingId;
            const visibleText = streaming ? message.text.slice(0, streamedLength) : message.text;
            return <article className={`chat-message assistant${streaming ? " streaming" : ""}`} key={message.id}><div className="chat-answer-label"><MessageCircle size={14} /><span>{streaming ? "Streaming evidence-backed answer" : message.answer?.generated_by === "model" ? "AI recommendation" : "Evidence retrieval"}</span></div><p>{visibleText}{streaming && <span className="streaming-cursor" aria-hidden="true" />}</p>{!streaming && message.answer && (message.answer.sources.length ? <div className="chat-sources"><strong>{message.answer.sources.length} cited source{message.answer.sources.length === 1 ? "" : "s"}</strong>{message.answer.sources.map((source, index) => <Link key={`${source.contract_id}-${index}`} href={`/contracts/${source.contract_id}?tab=ask`} onClick={() => setOpen(false)}><span>{source.contract_title}<ArrowUpRight size={13} /></span><small>{source.location}</small><blockquote>{source.excerpt}</blockquote></Link>)}</div> : <div className="unsupported-answer"><BookOpen size={15} />No retained excerpt supports a more specific answer.</div>)}</article>;
          })}
          {phase === "loading" && <div className="chat-progress loading" role="status" aria-live="polite"><span className="progress-grid" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span><div><strong>Opening evidence index</strong><span>Connecting to retained workspace records · {elapsed.toFixed(1)}s</span></div></div>}
          {phase === "thinking" && <details className="chat-progress thinking" open><summary><span className="thinking-pulse" aria-hidden="true"><i /><i /><i /></span><div><strong>Reviewing retained evidence</strong><span>Searching contracts and citations · {elapsed.toFixed(1)}s</span></div><ChevronDown size={15} /></summary><div className="thinking-steps" aria-live="polite"><span><i />Locate relevant agreements</span><span><i />Check source excerpts and dates</span><span><i />Compose a supported response</span></div></details>}
          {error && <div className="chat-error" role="alert"><strong>Answer unavailable</strong><p>{error}</p></div>}
        </div>
        <form className="ai-composer" onSubmit={(event: FormEvent) => { event.preventDefault(); void ask(question); }}><label htmlFor="ai-question">Ask across this workspace</label><div><textarea ref={inputRef} id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about a clause, deadline, or finding" rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(question); } }} /><button type="submit" aria-label="Send question" disabled={busy || question.trim().length < 3}><Send size={17} /></button></div><p>Answers include sources. Human review owns every decision.</p></form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
