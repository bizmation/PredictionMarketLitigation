// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RunLogItem } from "../../shared/schemas/run";
import { RunLog } from "./RunLog";
const rows: RunLogItem[] = Array.from({ length: 12 }, (_, i) => ({
  id: `run-20261004-${i.toString(16).padStart(4, "0")}`,
  origin: i % 2 ? "manual" : "scheduled",
  mode: "hitl",
  status: i % 2 ? "failed" : "published",
  startedAt: new Date(Date.UTC(2026, 9, 4, 0, i)).toISOString(),
  completedAt: null,
  scheduledFor: "2026-10-04",
  spendCents: i * 10,
  spendCurrency: "USD",
  budgetCents: i === 0 ? null : 500,
  eventCount: i,
  approvalOutcome: null
}));
afterEach(cleanup);
const visibleIds = () =>
  within(screen.getByRole("table"))
    .getAllByRole("link")
    .map((link) => link.textContent);
describe("Run log controls", () => {
  it("sorts real rows, paginates, and resets pagination when filtering", () => {
    render(<RunLog items={rows} />);
    expect(visibleIds()).toHaveLength(10);
    expect(visibleIds()[0]).toBe(rows[11]!.id);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(visibleIds()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Outcome"), {
      target: { value: "failed" }
    });
    expect(visibleIds()).toHaveLength(6);
    expect(
      screen.getByRole("button", { name: "Previous" }).hasAttribute("disabled")
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Budget accounting" }));
    expect(visibleIds()[0]).toBe(rows[1]!.id);
    expect(
      screen
        .getByRole("columnheader", { name: "Budget accounting" })
        .getAttribute("aria-sort")
    ).toBe("ascending");
    fireEvent.click(screen.getByRole("button", { name: "Budget accounting" }));
    expect(visibleIds()[0]).toBe(rows[11]!.id);
  });
  it("combines search and origin, offers recovery from zero matches, and preserves evidence links", () => {
    render(<RunLog items={rows} dev />);
    fireEvent.change(screen.getByLabelText("Search runs"), {
      target: { value: rows[2]!.id }
    });
    expect(visibleIds()).toEqual([rows[2]!.id]);
    expect(
      screen.getByRole("link", { name: rows[2]!.id }).getAttribute("href")
    ).toBe(`/runs/${rows[2]!.id}?surface=ops`);
    fireEvent.change(screen.getByLabelText("Origin"), {
      target: { value: "manual" }
    });
    expect(screen.getByText(/No runs match/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(visibleIds()).toHaveLength(10);
    fireEvent.change(screen.getByLabelText("Rows per page"), {
      target: { value: "25" }
    });
    expect(visibleIds()).toHaveLength(12);
  });
  it("keeps unknown budgets last in both directions and uncertainty visible outside details", () => {
    render(<RunLog items={[{ ...rows[0]!, uncertainCents: 50 }, rows[1]!]} />);
    fireEvent.click(screen.getByRole("button", { name: "Budget ceiling" }));
    expect(visibleIds().at(-1)).toBe(rows[0]!.id);
    fireEvent.click(screen.getByRole("button", { name: "Budget ceiling" }));
    expect(visibleIds().at(-1)).toBe(rows[0]!.id);
    expect(
      screen.getByText("Accounting needs review").closest("details")
    ).toBeNull();
  });
});
