import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { contractFixture } from "@/test/agent-fixtures";
import type { Job } from "@/lib/types";
import { ContractDetail } from "./contract-detail";

const state = vi.hoisted(() => ({ tab: "overview" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => ({ get: () => state.tab }) }));
vi.mock("./workspace-provider", () => ({ useWorkspace: () => ({ activeOrganization: { id: "org-1" }, canUpload: false, canDelete: false, isDemo: false }) }));
vi.mock("@/lib/workspace-query-hooks", () => ({ useTaskPage: () => ({ data: { items: [], total: 0 }, offset: 0, setOffset: vi.fn() }) }));
vi.mock("@/lib/use-question-stream", () => ({ useQuestionStream: () => ({ isPending: false }) }));
vi.mock("@/lib/api", () => ({ ApiError: class extends Error {}, api: { contract: vi.fn(), review: vi.fn(), jobs: vi.fn(), contractActivity: vi.fn(), deleteContract: vi.fn() } }));

const raw = "Error code: 404 - secret-provider-value model_not_found llama-3.3-70b-versatile";
const job: Job = { id: "12099de8-2395-4316-a0e5-8ae5ad8b4772", kind: "contract_review", status: "failed", attempts: 1, error_code: "NotFoundError", error_message: raw, progress_step: raw, created_at: "2026-09-11T09:00:00Z", started_at: null, completed_at: null };

beforeEach(() => {
  state.tab = "overview";
  vi.mocked(api.contract).mockResolvedValue({ ...contractFixture, status: "failed", latest_job: job });
  vi.mocked(api.jobs).mockResolvedValue([job]);
  vi.mocked(api.review).mockResolvedValue({ id: "review-1", analysis: {}, quality: {}, source_text_retained: false, created_at: job.created_at, updated_at: job.created_at });
  vi.mocked(api.contractActivity).mockResolvedValue([{ id: "event-1", action: "review.failed", detail: { job_id: job.id, error_message: raw, nested: { provider: raw } }, actor_user_id: null, actor_name: "System", created_at: job.created_at }]);
});

function openDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><ContractDetail contractId={contractFixture.id} /></QueryClientProvider>);
}

it("protects the actual failure page even when cached API data contains raw errors", async () => {
  const { container } = openDetail();
  expect(await screen.findByRole("alert")).toHaveTextContent(`Support reference: ${job.id}`);
  expect(container).not.toHaveTextContent(/404|secret-provider-value|model_not_found|llama/);
});

it("protects historical jobs and audit details on the activity tab", async () => {
  state.tab = "activity";
  vi.mocked(api.contract).mockResolvedValue({ ...contractFixture, latest_job: { ...job, status: "ready" } });
  const { container } = openDetail();
  await screen.findByText("Processing jobs");
  await screen.findByText(new RegExp(`Reference: ${job.id}`));
  expect(container).not.toHaveTextContent(/404|secret-provider-value|model_not_found|llama/);
  expect(container).toHaveTextContent("Contact support if you still need it.");
});

it("does not hide unrelated human activity details", async () => {
  state.tab = "activity";
  vi.mocked(api.contract).mockResolvedValue({ ...contractFixture, latest_job: null });
  vi.mocked(api.contractActivity).mockResolvedValue([{ id: "event-2", action: "contract.updated", detail: { title: "Updated supplier agreement" }, actor_user_id: "user-1", actor_name: "Reviewer", created_at: job.created_at }]);
  openDetail();
  expect(await screen.findByText(/Updated supplier agreement/)).toHaveTextContent("Reviewer");
});
