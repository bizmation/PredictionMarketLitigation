import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DraftRecord } from "../../shared/schemas/run";
import { ApprovalQueue, isQueueItem } from "./ApprovalQueue";

/**
 * Story 3.10 — the admin queue I/O matrix at the markup level, rendered via
 * renderToStaticMarkup (effects never run, so the injected prop is the only
 * data source). The live fetch and keyboard wiring are covered in
 * approvalQueue.mount.test.tsx.
 */

function draft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "draft-nv-1",
    runId: "run-20260912-aaa1",
    targetEntityType: "states",
    targetEntityId: "st-nv",
    diff: { posture: { from: "untracked", to: "pending" } },
    body: "Nevada posture proposal body.",
    tier2Only: false,
    confidence: 61,
    evalSummary: {
      status: "ok",
      basis: "all claims cited",
      citationCompleteness: 100,
      disagreement: { flagged: false, description: null },
      ineligible: []
    },
    outcome: null,
    decidedAt: null,
    decidedBy: null,
    editedBody: null,
    rejectReason: null,
    createdAt: "2026-09-12T16:05:00.000Z",
    updatedAt: "2026-09-12T16:05:00.000Z",
    ...overrides
  };
}

describe("isQueueItem", () => {
  it("accepts a well-formed wire row and rejects schema violations", () => {
    expect(isQueueItem(draft())).toBe(true);
    expect(isQueueItem(null)).toBe(false);
    expect(isQueueItem({ ...draft(), runId: "not-a-run-id" })).toBe(false);
    expect(isQueueItem({ ...draft(), body: "" })).toBe(false);
    expect(isQueueItem({ ...draft(), confidence: 1.5 })).toBe(false);
    expect(isQueueItem({ ...draft(), diff: "posture" })).toBe(false);
    expect(isQueueItem({ ...draft(), rejectReason: 42 })).toBe(false);
  });
});

describe("ApprovalQueue markup", () => {
  it("renders the qitem list with the first item selected", () => {
    const html = renderToStaticMarkup(
      <ApprovalQueue
        items={[draft(), draft({ id: "draft-ma-1", targetEntityId: "st-ma" })]}
      />
    );
    expect(html).toContain('class="queue"');
    expect(html).toContain('class="qitem"');
    const selections = html.match(/aria-selected="true"/g) ?? [];
    expect(selections).toHaveLength(1);
    expect(html).toContain("states · st-nv");
    expect(html).toContain("states · st-ma");
  });

  it("shows the full body, proposed diff, and flags in the work panel", () => {
    const html = renderToStaticMarkup(<ApprovalQueue items={[draft()]} dev />);
    expect(html).toContain('class="work"');
    expect(html).toContain("Nevada posture proposal body.");
    expect(html).toContain("Proposed text");
    expect(html).toContain("Effect on the tracker");
    expect(html).toContain("Live now");
    expect(html).toContain("If approved");
    expect(html).toContain("<del>untracked</del>");
    expect(html).toContain("<ins>pending</ins>");
    expect(html).toContain("Confidence 61/100");
    expect(html).toContain("Evals · ok");
    expect(html).toContain("Drafted by agent");
    expect(html).toContain("Publishes as human-approved");
    expect(html).toContain('href="/runs/run-20260912-aaa1?surface=ops"');
    for (const key of ["A", "E", "R"]) {
      expect(html).toContain(`class="kbd">${key}</span>`);
    }
  });

  it("uses the production ops. origin for the evidence link outside dev", () => {
    const html = renderToStaticMarkup(<ApprovalQueue items={[draft()]} />);
    expect(html).toContain(
      'href="https://ops.predictionmarketlitigation.com/runs/run-20260912-aaa1"'
    );
    expect(html).not.toContain("?surface=");
  });

  it("flags tier-2-only, disagreement, and the designed confidence/eval empties", () => {
    const tier2 = renderToStaticMarkup(
      <ApprovalQueue
        items={[
          draft({
            tier2Only: true,
            confidence: null,
            evalSummary: null
          })
        ]}
      />
    );
    expect(tier2).toContain("Tier-2 source only");
    expect(tier2).toContain("Confidence not recorded");
    expect(tier2).toContain("Evals not run");

    const flagged = renderToStaticMarkup(
      <ApprovalQueue
        items={[
          draft({
            evalSummary: {
              ...draft().evalSummary!,
              status: "evals_not_run",
              disagreement: { flagged: true, description: "dissent" }
            }
          })
        ]}
      />
    );
    expect(flagged).toContain('class="warn"');
    expect(flagged).toContain("Reviewer disagreement");
  });

  it("renders the designed EmptyState for an empty queue", () => {
    const html = renderToStaticMarkup(<ApprovalQueue items={[]} />);
    expect(html).toContain('class="empty"');
    expect(html).toContain("Nothing awaiting approval");
    expect(html).toContain(
      "An empty queue means the pipeline proposed nothing, not that it failed."
    );
    expect(html).not.toContain('class="qitem"');
  });

  it("never renders the not-live banner inside the operator surface", () => {
    // Admin works pending drafts under its own chrome; the six-word not-live
    // label belongs to the public ops. reading.
    const html = renderToStaticMarkup(<ApprovalQueue items={[draft()]} />);
    expect(html).not.toContain("Not live · awaiting approval");
  });
});
