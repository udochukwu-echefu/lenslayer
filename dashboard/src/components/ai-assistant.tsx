"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, BookOpen, ChevronDown, MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
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
  const turnFrameRef = useRef(0);
  const idleFrameRef = useRef(0);
  const idleTimerRef = useRef(0);
  const glanceIndexRef = useRef(0);
  const draggedRef = useRef(false);
  const dragRef = useRef({ active: false, pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0, targetX: 0, targetY: 0, x: 0, y: 0, velocityX: 0, velocityY: 0 });
  const busy = phase !== "idle";

  function renderTurn(x: number, y: number) {
    const orb = orbRef.current;
    if (!orb) return;
    const turnX = Math.max(-1, Math.min(1, x / 60));
    const turnY = Math.max(-1, Math.min(1, y / 22));
    const depth = Math.abs(turnX);
    orb.style.setProperty("--eye-x", `${turnX * 12.2}px`);
    orb.style.setProperty("--eye-y", `${turnY * 4.2}px`);
    orb.style.setProperty("--eye-turn", `${turnX * 6.5}deg`);
    orb.style.setProperty("--left-eye-scale", "1");
    orb.style.setProperty("--right-eye-scale", "1");
    orb.style.setProperty("--face-gap", `${6.5 - depth * 3}px`);
    orb.style.setProperty("--body-scale-x", `${1 - depth * 0.032}`);
    orb.style.setProperty("--body-scale-y", `${1 + depth * 0.018}`);
    orb.style.setProperty("--light-x", `${34 - turnX * 6}%`);
    orb.style.setProperty("--light-y", `${29 - turnY * 3}%`);
    orb.style.setProperty("--shade-x", `${64 - turnX * 10}%`);
  }

  function followTurn() {
    window.cancelAnimationFrame(turnFrameRef.current);
    const step = () => {
      const drag = dragRef.current;
      if (!drag.active) return;
      drag.velocityX = (drag.velocityX + (drag.targetX - drag.x) * 0.32) * 0.62;
      drag.velocityY = (drag.velocityY + (drag.targetY - drag.y) * 0.32) * 0.62;
      drag.x += drag.velocityX;
      drag.y += drag.velocityY;
      renderTurn(drag.x, drag.y);
      turnFrameRef.current = window.requestAnimationFrame(step);
    };
    turnFrameRef.current = window.requestAnimationFrame(step);
  }

  function settleTurn() {
    window.cancelAnimationFrame(turnFrameRef.current);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dragRef.current.x = 0;
      dragRef.current.y = 0;
      dragRef.current.targetX = 0;
      dragRef.current.targetY = 0;
      renderTurn(0, 0);
      return;
    }
    const step = () => {
      const drag = dragRef.current;
      drag.velocityX = (drag.velocityX + (0 - drag.x) * 0.16) * 0.68;
      drag.velocityY = (drag.velocityY + (0 - drag.y) * 0.16) * 0.68;
      drag.x += drag.velocityX;
      drag.y += drag.velocityY;
      renderTurn(drag.x, drag.y);
      if (Math.abs(drag.x) + Math.abs(drag.y) + Math.abs(drag.velocityX) + Math.abs(drag.velocityY) > 0.08) {
        turnFrameRef.current = window.requestAnimationFrame(step);
      } else {
        drag.x = 0;
        drag.y = 0;
        drag.targetX = 0;
        drag.targetY = 0;
        drag.velocityX = 0;
        drag.velocityY = 0;
        renderTurn(0, 0);
      }
    };
    turnFrameRef.current = window.requestAnimationFrame(step);
  }

  function startTurn(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return;
    window.cancelAnimationFrame(turnFrameRef.current);
    window.cancelAnimationFrame(idleFrameRef.current);
    draggedRef.current = false;
    const currentX = dragRef.current.x;
    const currentY = dragRef.current.y;
    dragRef.current = { active: true, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: currentX, originY: currentY, targetX: currentX, targetY: currentY, x: currentX, y: currentY, velocityX: 0, velocityY: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    orbRef.current?.setAttribute("data-dragging", "true");
    followTurn();
  }

  function turnCharacter(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    const nextX = Math.max(-60, Math.min(60, drag.originX + event.clientX - drag.startX));
    const nextY = Math.max(-26, Math.min(26, drag.originY + event.clientY - drag.startY));
    drag.targetX = nextX;
    drag.targetY = nextY;
    if (Math.hypot(nextX, nextY) > 4) draggedRef.current = true;
  }

  function releaseTurn(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    drag.active = false;
    drag.targetX = 0;
    drag.targetY = 0;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    orbRef.current?.removeAttribute("data-dragging");
    settleTurn();
    window.setTimeout(() => { draggedRef.current = false; }, 0);
  }

  useEffect(() => {
    if (open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let disposed = false;
    const glances = [
      { x: -14, y: -3 },
      { x: 11, y: 2 },
      { x: 15, y: -2 },
      { x: -10, y: 3 },
    ];

    const animateTo = (targetX: number, targetY: number, duration: number, complete: () => void) => {
      window.cancelAnimationFrame(idleFrameRef.current);
      const fromX = dragRef.current.x;
      const fromY = dragRef.current.y;
      const startedAt = performance.now();
      const step = (now: number) => {
        if (disposed) return;
        if (dragRef.current.active) {
          schedule(2200);
          return;
        }
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 4);
        dragRef.current.x = fromX + (targetX - fromX) * eased;
        dragRef.current.y = fromY + (targetY - fromY) * eased;
        renderTurn(dragRef.current.x, dragRef.current.y);
        if (progress < 1) idleFrameRef.current = window.requestAnimationFrame(step);
        else complete();
      };
      idleFrameRef.current = window.requestAnimationFrame(step);
    };

    const glance = () => {
      const target = glances[glanceIndexRef.current % glances.length];
      glanceIndexRef.current += 1;
      animateTo(target.x, target.y, 360, () => {
        idleTimerRef.current = window.setTimeout(() => {
          animateTo(target.x * 0.62, target.y * 0.5, 240, () => {
            idleTimerRef.current = window.setTimeout(() => animateTo(0, 0, 440, schedule), 520);
          });
        }, 720);
      });
    };

    function schedule(delay = 2600 + Math.random() * 2400) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        if (dragRef.current.active) schedule(2200);
        else glance();
      }, delay);
    }

    schedule(1400);
    return () => {
      disposed = true;
      window.clearTimeout(idleTimerRef.current);
      window.cancelAnimationFrame(idleFrameRef.current);
    };
  }, [open]);

  useEffect(() => () => {
    window.cancelAnimationFrame(turnFrameRef.current);
    window.cancelAnimationFrame(idleFrameRef.current);
    window.clearTimeout(idleTimerRef.current);
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
    <Dialog.Trigger asChild><button ref={orbRef} className="ask-ai-orb" type="button" aria-label="Ask LensLayer AI" onClick={(event) => { if (draggedRef.current) { event.preventDefault(); event.stopPropagation(); draggedRef.current = false; } }}><span className="orb-character" aria-hidden="true" onPointerDown={startTurn} onPointerMove={turnCharacter} onPointerUp={releaseTurn} onPointerCancel={releaseTurn}><span className="orb-highlight" /><span className="orb-eyes"><i /><i /></span></span><span className="orb-label">Ask AI</span></button></Dialog.Trigger>
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
