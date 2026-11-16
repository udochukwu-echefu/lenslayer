/**
 * Display helpers. formatDate…severity mirror dashboard/src/lib/utils.ts;
 * the review-job copy mirrors dashboard/src/lib/review-job-display.ts so
 * failures read the same on web and mobile.
 */
import type { ContractActivity, Job, WorkflowTask } from "./shared/types";

export function formatDate(value?: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, options ?? { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatRelativeDate(value?: string | null) {
  if (!value) return "Unknown";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Unknown";
  const days = Math.round((time - Date.now()) / 86_400_000);
  if (Math.abs(days) > 14) return formatDate(value);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(days) >= 1) return formatter.format(days, "day");
  const hours = Math.round((time - Date.now()) / 3_600_000);
  if (Math.abs(hours) >= 1) return formatter.format(hours, "hour");
  return "just now";
}

export function dueAtEndOfDay(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

export function isOverdue(value: string | null | undefined, now: number) {
  const due = dueAtEndOfDay(value);
  return due !== null && due < now;
}

export function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "LL";
}

export function asText(value: unknown, fallback = "Not identified") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

export function severity(value?: string) {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("high") || normalized.includes("critical")) return "high";
  if (normalized.includes("medium") || normalized.includes("moderate")) return "medium";
  return "low";
}

const failureMessages: Record<string, string> = {
  review_service_unavailable: "The document review service was unavailable. Contact support if you still need this review.",
  review_service_busy: "The document review service was busy. Contact support if you still need this review.",
  review_timeout: "The review took too long to finish. Contact support if you still need this review.",
  source_retention_expired: "The saved document has expired. Upload it again to start a new review.",
  source_unavailable: "The source document is no longer available. Upload it again to start a new review.",
  review_interrupted: "The review was interrupted before it finished. Contact support if you still need this review.",
  document_parse_failed: "The document could not be read. Check that its pages are complete and legible before uploading a new copy.",
  review_failed: "We couldn’t complete this review. Contact support if you still need it.",
};

const legacyCodes: Record<string, string> = {
  SourceRetentionExpired: "source_retention_expired",
  SourceUnavailable: "source_unavailable",
  WorkerLeaseExpired: "review_interrupted",
};

function publicCode(code: unknown): string {
  if (typeof code !== "string") return "review_failed";
  if (Object.hasOwn(failureMessages, code)) return code;
  if (Object.hasOwn(legacyCodes, code)) return legacyCodes[code];
  return "review_failed";
}

export function reviewJobMessage(job: Pick<Job, "error_code"> | null | undefined): string {
  // Old API responses may still be cached. Never display their stored message.
  return failureMessages[publicCode(job?.error_code)];
}

export function reviewJobReference(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function reviewJobProgress(job: Pick<Job, "status" | "error_code" | "progress_step"> | null | undefined): string {
  if (!job) return "";
  switch (job.status) {
    case "failed": {
      const code = publicCode(job.error_code);
      return code === "source_retention_expired" ? "Source retention expired" : code === "source_unavailable" ? "Source unavailable" : "Review failed";
    }
    case "queued":
    case "pending": return "Waiting for a review worker";
    case "processing":
    case "running": return ["Extracting document text", "Analysing clauses and obligations"].includes(job.progress_step) ? job.progress_step : "Preparing the document for analysis";
    case "ready":
    case "reviewed":
    case "succeeded":
    case "completed": return "Review ready";
    case "cancelled": return "Review cancelled";
    default: return "Review pending";
  }
}

export function contractActivityDetail(event: Pick<ContractActivity, "action" | "detail">): string {
  if (event.action === "review.failed" || event.action === "contract.review_failed") {
    const reference = reviewJobReference(event.detail.job_id);
    return reference ? `Reference: ${reference}` : "";
  }
  return Object.entries(event.detail).slice(0, 3).map(([key, value]) => `${titleCase(key)}: ${asText(value)}`).join(" · ");
}

/** Where a task came from. Contract-backed tasks link to their contract. */
export function taskSourceLabel(task: WorkflowTask) {
  return task.contract_id ? task.contract_title || "Contract source" : "Workspace action";
}

export function dueState(task: Pick<WorkflowTask, "due_at" | "status">, now = Date.now()): "" | "overdue" | "today" {
  if (!task.due_at || ["done", "cancelled"].includes(task.status)) return "";
  const due = dueAtEndOfDay(task.due_at);
  if (due === null) return "";
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (due < now) return "overdue";
  if (due <= endOfToday.getTime()) return "today";
  return "";
}

export function fileSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes > 1024 * 1024 ? 1 : 2)} MB`;
}

/** YYYY-MM-DD in local time, as the calendar query expects. */
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Whole calendar days from `now` to `value`: negative when the date has passed. */
export function daysUntil(value: string, now = Date.now()) {
  const day = (time: number) => { const date = new Date(time); date.setHours(0, 0, 0, 0); return date.getTime(); };
  return Math.round((day(new Date(value).getTime()) - day(now)) / 86_400_000);
}
