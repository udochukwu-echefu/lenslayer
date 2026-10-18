import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useCalendarGrid, useLifecyclePage, useTaskPage } from "@/lib/workspace-query-hooks";
import CalendarPage from "@/app/(workspace)/calendar/page";
import type { CalendarGrid } from "@/lib/api/workspace-queries";

vi.mock("./workspace-provider", () => ({ useWorkspace: () => ({ activeOrganization: { id: "synthetic-org" }, canUpload: false, isDemo: true }) }));
vi.mock("@/lib/workspace-query-hooks", () => ({ useCalendarGrid: vi.fn(), useTaskPage: vi.fn(), useLifecyclePage: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: {} }));

it("shows every day's real occupancy regardless of either agenda page or sorting", () => {
  const year = new Date().getFullYear(), month = new Date().getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const key = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const days = Array.from({ length: count }, (_, i) => ({ date: key(i + 1), total: i === 0 ? 202 : 2, items: [
    { id: `t-${i}`, title: `Task ${i + 1}`, kind: "task", category: "normal", due_at: `${key(i + 1)}T12:00:00Z`, contract_id: null, status: "open", escalated: false },
    { id: `l-${i}`, title: `Notice ${i + 1}`, kind: "lifecycle", category: "notice", due_at: `${key(i + 1)}T12:00:00Z`, contract_id: "contract", status: "active", escalated: false },
  ] })) as CalendarGrid["days"];
  vi.mocked(useCalendarGrid).mockReturnValue({ data: { days, month_total: count * 2 + 200, grid_total: count * 2 + 200, timezone: "UTC" }, isLoading: false, error: null } as ReturnType<typeof useCalendarGrid>);
  const next = vi.fn();
  const page = { data: { items: [], total: count, limit: 25, offset: 0 }, offset: 0, setOffset: next, isLoading: false, error: null };
  vi.mocked(useTaskPage).mockReturnValue(page as never); vi.mocked(useLifecyclePage).mockReturnValue(page as never);
  const view = render(<CalendarPage />);
  const links = (day: number) => view.container.querySelector(`.calendar-grid time[datetime="${key(day)}"]`)?.parentElement?.querySelectorAll("a").length;
  expect(links(1)).toBe(2); expect(links(count)).toBe(2); expect(screen.getByText("+200 more")).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Next" })[0]); expect(next).toHaveBeenCalledWith(25);
  vi.mocked(useTaskPage).mockReturnValue({ ...page, offset: 25 } as never);
  vi.mocked(useLifecyclePage).mockReturnValue({ ...page, offset: 25 } as never);
  view.rerender(<CalendarPage />);
  fireEvent.click(screen.getByRole("button", { name: "Earliest dates first" }));
  expect(links(1)).toBe(2); expect(links(count)).toBe(2); expect(screen.getByText("+200 more")).toBeInTheDocument();
  expect(screen.getByText(`${count * 2 + 200} dated items`)).toBeInTheDocument();
});
