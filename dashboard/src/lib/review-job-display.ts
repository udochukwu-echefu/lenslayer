import type { ContractActivity, Job } from "./types";
import { asText, titleCase } from "./utils";

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
