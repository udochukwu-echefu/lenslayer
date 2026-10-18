import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { contractActivityDetail, reviewJobMessage, reviewJobProgress } from "@/lib/review-job-display";
import type { Job } from "@/lib/types";
import { ContractReviewFailure } from "./contract-review-failure";

const reference = "12099de8-2395-4316-a0e5-8ae5ad8b4772";
const raw = "Error code: 404 - {'error': {'message': 'The model llama-3.3-70b-versatile does not exist', 'code': 'model_not_found', 'token': 'secret-provider-value'}}";
const job: Job = { id: reference, kind: "contract_review", status: "failed", attempts: 1, error_code: "NotFoundError", error_message: raw, progress_step: raw, created_at: "2026-09-11T09:00:00Z", started_at: null, completed_at: null };

it("replaces a legacy provider error with an explanation and safe support reference", () => {
  const { container } = render(<ContractReviewFailure job={job} />);
  expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t complete this review. Contact support if you still need it.");
  expect(screen.getByRole("alert")).toHaveTextContent(`Support reference: ${reference}`);
  expect(container).not.toHaveTextContent(/llama|404|model_not_found|secret-provider-value/);
});

it("gives a neutral explanation when there is no latest job", () => {
  render(<ContractReviewFailure job={null} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Contact support if you still need it.");
  expect(screen.queryByText(/Support reference/)).toBeNull();
});

it("does not expose an untrusted diagnostic reference", () => {
  const { container } = render(<ContractReviewFailure job={{ ...job, id: raw }} />);
  expect(container).not.toHaveTextContent(/404|llama|Support reference/);
});

it.each(["review_failed", "unknown: secret-provider-value", "__proto__", "constructor", ""])("fails closed for a cached error code %s", (error_code) => {
  expect(reviewJobMessage({ error_code })).toBe("We couldn’t complete this review. Contact support if you still need it.");
});

it("handles a malformed cached code without rendering or coercing its diagnostics", () => {
  expect(reviewJobMessage({ error_code: { toString: raw } as unknown as string })).toBe("We couldn’t complete this review. Contact support if you still need it.");
});

it.each(["source_retention_expired", "SourceRetentionExpired"])("preserves the source expiry explanation for %s", (error_code) => {
  expect(reviewJobMessage({ error_code })).toContain("saved document has expired");
  expect(reviewJobProgress({ ...job, error_code })).toBe("Source retention expired");
});

it.each(["source_unavailable", "SourceUnavailable"])("preserves the source availability explanation for %s", (error_code) => {
  expect(reviewJobMessage({ error_code })).toContain("source document is no longer available");
});

it.each(["failed", "queued", "running", "processing", "ready", "reviewed", "unknown"])("never displays stored diagnostics as progress for %s", (status) => {
  expect(reviewJobProgress({ ...job, status })).not.toMatch(/llama|404|model_not_found|secret-provider-value/);
});

it("preserves known active progress", () => {
  expect(reviewJobProgress({ ...job, status: "running", progress_step: "Extracting document text" })).toBe("Extracting document text");
});

it.each(["review.failed", "contract.review_failed"])("keeps only the reference in cached %s audit data", (action) => {
  expect(contractActivityDetail({ action, detail: { job_id: reference, error_message: raw, error_code: raw, nested: { error: raw } } })).toBe(`Reference: ${reference}`);
  expect(contractActivityDetail({ action, detail: { job_id: raw } })).toBe("");
});
