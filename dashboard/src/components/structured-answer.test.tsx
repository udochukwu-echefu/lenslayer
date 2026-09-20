import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StructuredAnswer } from "./structured-answer";

describe("StructuredAnswer", () => {
  it("renders headings, lists, emphasis, and source markers as readable content", () => {
    render(<StructuredAnswer text={"### What matters\n- **Renewal:** Give notice in time [Source 1]\n- Confirm the service address"} />);

    expect(screen.getByRole("heading", { name: "What matters" })).toBeVisible();
    expect(screen.getByRole("list")).toBeVisible();
    expect(screen.getByText("Renewal:")).toHaveRole("strong");
    expect(screen.getByText("[Source 1]")).toHaveClass("answer-source-marker");
  });

  it("turns markdown tables into scannable row cards", () => {
    const answer = "| Topic | What the agreement says | Evidence |\n| --- | --- | --- |\n| Payment | Due in 14 days | [Source1] · section 2.1 |\n| Indemnity | Customer covers claims<br>Supplier protection is absent | [Source2] |";
    const { container } = render(<StructuredAnswer text={answer} />);
    const cards = container.querySelectorAll(".answer-table article");

    expect(cards).toHaveLength(2);
    expect(within(cards[0] as HTMLElement).getByText("Payment")).toBeVisible();
    expect(within(cards[1] as HTMLElement).getByText(/Supplier protection is absent/)).toBeVisible();
  });
});
