import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RunLogItem } from "../../shared/schemas/run";
import { LoopControls } from "./LoopControls";

function item(overrides: Partial<RunLogItem> = {}): RunLogItem {
  return {
    id: "run-20261110-0002",
    origin: "manual",
    mode: "hitl",
    status: "published",
    startedAt: "2026-11-10T16:00:00.000Z",
    completedAt: "2026-11-10T16:05:00.000Z",
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: null,
    scheduledFor: "2026-11-10",
    eventCount: 2,
    approvalOutcome: null,
    ...overrides
  };
}

describe("LoopControls (story 3.12)", () => {
  it("shows Run now and an empty latest when there are no runs", () => {
    const html = renderToStaticMarkup(<LoopControls latest={null} />);
    expect(html).toContain("Run now");
    expect(html).toContain("No runs yet.");
    expect(html).toContain('class="btn btn-primary"');
  });

  it("renders running as muted text, not a status chip", () => {
    const html = renderToStaticMarkup(
      <LoopControls latest={item({ status: "running", completedAt: null })} />
    );
    expect(html).toContain('class="muted"');
    expect(html).toContain("running");
    expect(html).not.toContain('class="run published"');
    expect(html).toContain('class="origin"');
    expect(html).toContain("manual");
  });

  it("uses RunStatusChip vocabulary for terminal statuses", () => {
    const html = renderToStaticMarkup(
      <LoopControls latest={item({ status: "awaiting" })} />
    );
    expect(html).toContain("awaiting approval");
    expect(html).toContain('class="run awaiting"');
  });
});
