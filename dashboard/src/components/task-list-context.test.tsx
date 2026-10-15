import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { WorkflowTask } from "@/lib/types";
import { agentQueryWrapper } from "@/test/agent-query-wrapper";
import { TaskList } from "./task-list";

vi.mock("./workspace-provider", () => ({ useWorkspace: () => ({ activeOrganization: { id: "org-1" }, canUpload: false, isDemo: false }) }));
const task: WorkflowTask = { id: "context-task", organization_id: "org-1", contract_id: null, contract_title: null, created_by_user_id: "riley", assigned_to_user_id: "riley", assigned_to_name: "Riley Chen", assigned_to_email: "riley@example.test", title: "Review Northstar IT onboarding", description: "Follow-up task created; work not performed", category: "follow_up", priority: "normal", status: "open", due_at: null, source_kind: "agent", source_reference: { context_id: "context/1", evidence_id: "receipt" }, completed_at: null, created_at: "2026-10-14T12:00:00Z", updated_at: "2026-10-14T12:00:00Z" };
it.each([false, true])("renders nullable-contract context tasks safely, table=%s", (table) => {
  const { Wrapper } = agentQueryWrapper(); const { container } = render(<TaskList tasks={[task]} table={table} />, { wrapper: Wrapper });
  expect(screen.getByRole("link", { name: "Workspace context" })).toHaveAttribute("href", "/context/context%2F1");
  expect(container.querySelector('a[href^="/contracts/"]')).toBeNull();
  expect(screen.getByText("Open")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /status is read only/ })).toBeDisabled();
});
it("does not invent a source link when neither a contract nor actual context ID exists", () => {
  const { Wrapper } = agentQueryWrapper(); const { container } = render(<TaskList tasks={[{ ...task, source_reference: {} }]} />, { wrapper: Wrapper });
  expect(screen.getByText("Workspace action")).toBeInTheDocument(); expect(container.querySelector("a")).toBeNull();
});
