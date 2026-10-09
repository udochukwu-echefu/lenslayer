import { PollingStoppedError } from "./errors.js";
import { boundedInteger, sleep } from "./transport.js";
import type { AgentRun, RequestOptions } from "./types.js";

export interface PollOptions extends RequestOptions {
  intervalMs?: number;
  timeoutMs?: number;
  /** Optional known server deadline also bounds the first request. */
  deadlineAt?: string;
  onUpdate?: (run: AgentRun) => void | Promise<void>;
}

export function isTerminalRun(status: AgentRun["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export async function pollRun(runId: string, getRun: (options: RequestOptions) => Promise<AgentRun>, options: PollOptions = {}): Promise<AgentRun> {
  const timeoutMs = boundedInteger(options.timeoutMs ?? 300000, "timeoutMs", 1, 86400000);
  const interval = boundedInteger(options.intervalMs ?? 2000, "intervalMs", 1, 60000);
  const stopAt = Date.now() + timeoutMs;
  let deadline = options.deadlineAt === undefined ? Infinity : Date.parse(options.deadlineAt);
  if (Number.isNaN(deadline) || (options.deadlineAt !== undefined && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(options.deadlineAt))) throw new Error("deadlineAt must be an ISO date-time with a timezone.");
  for (;;) {
    options.signal?.throwIfAborted();
    const remaining = Math.min(stopAt, deadline) - Date.now();
    if (remaining <= 0) throw new PollingStoppedError(deadline <= stopAt ? "deadline" : "timeout", runId);
    const timer = AbortSignal.timeout(Math.ceil(remaining));
    const signal = options.signal ? AbortSignal.any([options.signal, timer]) : timer;
    let run: AgentRun;
    try { run = await getRun({ signal }); } catch (error) {
      options.signal?.throwIfAborted();
      if (timer.aborted || Date.now() >= Math.min(stopAt, deadline)) throw new PollingStoppedError(deadline <= stopAt ? "deadline" : "timeout", runId);
      throw error;
    }
    await notifyWithinBudget(run, options, stopAt, deadline);
    if (isTerminalRun(run.status)) return run;
    deadline = Math.min(deadline, Date.parse(run.deadline_at));
    if (!Number.isFinite(deadline)) throw new Error("The server returned an invalid run deadline.");
    const wait = Math.min(interval, Math.min(stopAt, deadline) - Date.now());
    if (wait > 0) await sleep(wait, options.signal);
  }
}

async function notifyWithinBudget(run: AgentRun, options: PollOptions, stopAt: number, knownDeadline: number): Promise<void> {
  if (!options.onUpdate) return;
  const serverDeadline = Date.parse(run.deadline_at);
  if (!Number.isFinite(serverDeadline)) throw new Error("The server returned an invalid run deadline.");
  const deadline = isTerminalRun(run.status) ? knownDeadline : Math.min(knownDeadline, serverDeadline);
  const remaining = Math.min(stopAt, deadline) - Date.now();
  if (remaining <= 0) throw new PollingStoppedError(deadline <= stopAt ? "deadline" : "timeout", run.id);
  const timeout = AbortSignal.timeout(Math.ceil(remaining));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  signal.throwIfAborted();
  let abort: () => void = () => {};
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    await Promise.race([Promise.resolve().then(() => options.onUpdate?.(run)), aborted]);
  } catch (error) {
    options.signal?.throwIfAborted();
    if (timeout.aborted || Date.now() >= Math.min(stopAt, deadline)) throw new PollingStoppedError(deadline <= stopAt ? "deadline" : "timeout", run.id);
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
