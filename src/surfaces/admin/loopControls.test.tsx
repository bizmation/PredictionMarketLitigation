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

  it("renders running with a distinct status chip", () => {
    const html = renderToStaticMarkup(
      <LoopControls latest={item({ status: "running", completedAt: null })} />
    );
    expect(html).toContain('class="run running"');
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

  it("shows run reject only while the latest run is awaiting and a count is known", () => {
    const awaiting = renderToStaticMarkup(
      <LoopControls
        latest={item({ status: "awaiting" })}
        pendingHeadCount={4}
      />
    );
    expect(awaiting).toContain("Reject this run");
    expect(awaiting).not.toContain("accesskey");
    const published = renderToStaticMarkup(
      <LoopControls
        latest={item({ status: "published" })}
        pendingHeadCount={4}
      />
    );
    expect(published).not.toContain("Reject this run");
  });
});
