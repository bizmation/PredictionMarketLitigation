import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatEtDateTime } from "../../shared/lib/dates";
import type { RunLogItem } from "../../shared/schemas/run";
import { RUN_SCHEDULE_TIMEZONE } from "../../shared/schemas/vocabulary";
import { OpsShell } from "./OpsShell";
import { formatUsdCents, isRunLogItem, RunLog } from "./RunLog";

function item(
  overrides: Partial<RunLogItem> & Pick<RunLogItem, "id" | "status" | "origin">
): RunLogItem {
  return {
    mode: "hitl",
    startedAt: "2026-09-08T16:00:00.000Z",
    completedAt: "2026-09-08T16:05:00.000Z",
    spendCents: 47,
    spendCurrency: "USD",
    budgetCents: 200,
    scheduledFor: "2026-09-08",
    eventCount: 3,
    approvalOutcome: null,
    ...overrides
  };
}

const mixed: RunLogItem[] = [
  item({
    id: "run-20260908-aaa1",
    status: "published",
    origin: "scheduled",
    approvalOutcome: "approved",
    spendCents: 47,
    eventCount: 5
  }),
  item({
    id: "run-20260908-bbb2",
    status: "awaiting",
    origin: "catch-up",
    mode: "yolo",
    spendCents: 12,
    eventCount: 4,
    approvalOutcome: null
  }),
  item({
    id: "run-20260907-ccc3",
    status: "empty",
    origin: "manual",
    spendCents: 0,
    eventCount: 2,
    scheduledFor: null,
    approvalOutcome: null
  }),
  item({
    id: "run-20260907-ddd4",
    status: "failed",
    origin: "scheduled",
    spendCents: 3,
    eventCount: 1
  }),
  item({
    id: "run-20260907-eee5",
    status: "stopped",
    origin: "scheduled",
    spendCents: 200,
    eventCount: 8
  }),
  item({
    id: "run-20260907-fff6",
    status: "rejected",
    origin: "manual",
    approvalOutcome: "rejected",
    spendCents: 19,
    eventCount: 6
  }),
  item({
    id: "run-20260907-abc7",
    status: "running",
    origin: "scheduled",
    completedAt: null,
    spendCents: 0,
    eventCount: 1
  })
];

describe("formatUsdCents", () => {
  it("formats integer cents without a float and keeps zero visible", () => {
    expect(formatUsdCents(47)).toBe("$0.47");
    expect(formatUsdCents(0)).toBe("$0.00");
    expect(formatUsdCents(100)).toBe("$1.00");
  });
});

describe("isRunLogItem", () => {
  it("accepts a well-formed log row and rejects a missing eventCount", () => {
    expect(isRunLogItem(mixed[0])).toBe(true);
    expect(isRunLogItem({ ...mixed[0], eventCount: undefined })).toBe(false);
  });
});

describe("RunLog", () => {
  it("keeps EmptyState when the log is empty or the fetch failed closed", () => {
    const html = renderToStaticMarkup(<RunLog items={[]} />);
    expect(html).toContain('class="empty"');
    expect(html).toContain("No runs yet");
    expect(html).not.toContain("run-2026");
    expect(html).not.toContain("<table");
  });

  it("renders mixed chips, origins, zero spend, em dash, and Evidence hrefs", () => {
    const html = renderToStaticMarkup(<RunLog items={mixed} dev />);
    expect(html).toContain('class="grid"');
    expect(html).not.toContain('class="empty"');
    expect(html).not.toContain("No runs yet");

    expect(html).toContain('class="run published"');
    expect(html).toContain("published");
    expect(html).toContain('class="run awaiting"');
    expect(html).toContain("awaiting approval");
    expect(html).toContain('class="run noop"');
    expect(html).toContain("no material change");
    expect(html).toContain('class="run failed"');
    expect(html).toContain('class="run stopped"');
    expect(html).toContain("budget-stopped");
    expect(html).toContain('class="run rejected"');
    expect(html).toContain("running");
    expect(html).not.toContain('class="run running"');

    expect(html).toContain('class="origin">scheduled<');
    expect(html).toContain('class="origin">catch-up<');
    expect(html).toContain('class="origin">manual<');
    expect(html).not.toContain('class="run catch-up"');
    expect(html).not.toContain('class="run manual"');
    expect(html).not.toContain('class="run scheduled"');

    expect(html).toContain("hitl");
    expect(html).toContain("yolo");
    expect(html).toContain("$0.47");
    expect(html).toContain("$0.00");
    expect(html).toContain("$2.00");
    expect(html).toContain('class="num">5<');
    expect(html).toContain('class="num">8<');
    expect(html).toContain("approved");
    expect(html).toContain('class="muted">—<');

    expect(html).toContain('href="/runs/run-20260908-aaa1?surface=ops"');
    expect(html).toContain('href="/runs/run-20260907-abc7?surface=ops"');
    expect(html).toContain(formatEtDateTime("2026-09-08T16:00:00.000Z"));

    const lower = html.toLowerCase();
    expect(lower).not.toContain("sign in");
    expect(lower).not.toContain("log in");
    expect(html).not.toContain('type="password"');
  });

  it("uses the production ops. origin for Evidence links outside dev", () => {
    const html = renderToStaticMarkup(<RunLog items={[mixed[0]!]} />);
    expect(html).toContain(
      'href="https://ops.predictionmarketlitigation.com/runs/run-20260908-aaa1"'
    );
    expect(html).not.toContain("?surface=");
  });
});

describe("OpsShell run log (story 3.7)", () => {
  it("shows timezone and next noon-ET run, with no login wall", () => {
    const html = renderToStaticMarkup(<OpsShell />);
    expect(html).toContain('id="runs"');
    expect(html).toContain(RUN_SCHEDULE_TIMEZONE);
    expect(html).toContain("Next run");
    expect(html).toContain("12:00 ET");
    expect(html).not.toContain("not yet scheduled");
    expect(html).not.toContain("No runs yet");

    const lower = html.toLowerCase();
    expect(lower).not.toContain("sign in");
    expect(lower).not.toContain("log in");
    expect(html).not.toContain('type="password"');
  });

  it("keeps Evidence hrefs on ops. in dev via ?surface=ops", () => {
    const html = renderToStaticMarkup(<OpsShell dev items={[mixed[0]!]} />);
    expect(html).toContain("?surface=apex");
    expect(html).toContain('href="/runs/run-20260908-aaa1?surface=ops"');
    expect(html).not.toContain("not yet scheduled");
  });
});
