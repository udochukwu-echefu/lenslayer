import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { DataTable, type DataColumn } from "./data-table";
import { StatusBadge } from "./status-badge";
import { NotificationRow } from "../notification-row";
import type { Notification } from "@/lib/types";

type Row = { id: string; name: string; count: number; status: string };
const rows: Row[] = [
  { id: "b", name: "Beta agreement", count: 2, status: "failed" },
  { id: "a", name: "Alpha agreement", count: 8, status: "ready" },
];
const columns: DataColumn<Row>[] = [
  { id: "name", header: "Agreement", primary: true, sortValue: (row) => row.name, cell: (row) => row.name },
  { id: "count", header: "Findings", numeric: true, sortValue: (row) => row.count, cell: (row) => row.count },
  { id: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
];

describe("workspace UI primitives", () => {
  it("renders status with visible text and a non-color icon", () => {
    const { container } = render(<StatusBadge status="failed" />);
    expect(screen.getByText("Failed")).toBeVisible();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders semantic sortable table markup and mobile records", () => {
    render(<DataTable ariaLabel="Agreements" columns={columns} rows={rows} rowKey={(row) => row.id} rowHref={(row) => `/contracts/${row.id}`} empty="Empty" />);
    expect(screen.getByRole("table", { name: "Agreements" })).toBeInTheDocument();
    const agreementHeader = screen.getByRole("columnheader", { name: "Agreement" });
    expect(agreementHeader).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: "Agreement" }));
    expect(agreementHeader).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getAllByRole("link", { name: "Alpha agreement" }).length).toBeGreaterThan(0);
  });

  it("has no detectable axe violations", async () => {
    const { container } = render(<main><h1>Contract register</h1><DataTable ariaLabel="Agreements" columns={columns} rows={rows} rowKey={(row) => row.id} rowHref={(row) => `/contracts/${row.id}`} empty="Empty" /></main>);
    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });

  it("keeps a long notification feed complete and linkable", () => {
    const notifications: Notification[] = Array.from({ length: 24 }, (_, index) => ({
      id: String(index), organization_id: "demo", contract_id: null, kind: index % 2 ? "contract.review_ready" : "contract.review_failed",
      title: `Notification ${index + 1}`, message: "A deliberately long evidence review update that must wrap without hiding the destination or unread state.",
      action_url: `/contracts/${index}`, read_at: index % 3 ? new Date().toISOString() : null, created_at: new Date().toISOString(),
    }));
    render(<div className="notification-scroll">{notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} />)}</div>);
    expect(screen.getAllByRole("link")).toHaveLength(24);
    expect(screen.getByRole("link", { name: /Notification 24/ })).toHaveAttribute("href", "/contracts/23");
  });
});
