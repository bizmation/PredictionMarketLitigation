import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { formatEtDateTime } from "../../shared/lib/dates";
import type { DraftRecord } from "../../shared/schemas/run";
import { NOT_LIVE_LABEL } from "../../shared/ui";
import { isDraftRecord, PendingDrafts } from "./PendingDrafts";

/**
 * Story 3.9 — pending drafts I/O matrix, rendered via renderToStaticMarkup
 * (effects never run, so the injected prop is the only data source). The
 * live fetch wiring is covered in pendingDrafts.mount.test.tsx.
 */

function draft(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "draft-nv-1",
    runId: "run-20260908-aaa1",
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
    createdAt: "2026-09-08T16:05:00.000Z",
    updatedAt: "2026-09-08T16:05:00.000Z",
    ...overrides
  };
}

const REJECTED: DraftRecord = draft({
  id: "draft-rej-1",
  runId: "run-20260908-bbb2",
  targetEntityType: "states",
  targetEntityId: "st-ma",
  diff: { posture: { from: "untracked", to: "pending" } },
  body: "Massachusetts watch-note proposal, rejected.",
  tier2Only: false,
  confidence: 40,
  evalSummary: null,
  outcome: "rejected",
  decidedAt: "2026-09-08T17:30:00.000Z",
  decidedBy: "Patrick",
  editedBody: null,
  updatedAt: "2026-09-08T17:30:00.000Z"
});

describe("isDraftRecord", () => {
  it("accepts a well-formed wire row and rejects schema violations", () => {
    expect(isDraftRecord(draft())).toBe(true);
    expect(isDraftRecord(null)).toBe(false);
    expect(isDraftRecord({ ...draft(), runId: "not-a-run-id" })).toBe(false);
    expect(isDraftRecord({ ...draft(), body: "" })).toBe(false);
    expect(isDraftRecord({ ...draft(), confidence: 1.5 })).toBe(false);
    expect(isDraftRecord({ ...draft(), confidence: 101 })).toBe(false);
    expect(isDraftRecord({ ...draft(), diff: "posture" })).toBe(false);
    expect(isDraftRecord({ ...draft(), evalSummary: { status: "ok" } })).toBe(
      false
    );
    expect(
      isDraftRecord({
        ...draft(),
        evalSummary: { ...draft().evalSummary!, disagreement: null }
      })
    ).toBe(false);
  });
});

describe("PendingDrafts", () => {
  it("fails closed to the designed EmptyState when empty or all non-band rows", () => {
    const empty = renderToStaticMarkup(<PendingDrafts drafts={[]} />);
    expect(empty).toContain('class="empty"');
    expect(empty).toContain("No drafts awaiting approval");
    expect(empty).not.toContain(NOT_LIVE_LABEL);
    expect(empty).not.toContain("draft-nv-1");

    const approvedOnly = renderToStaticMarkup(
      <PendingDrafts
        drafts={[
          draft({
            outcome: "approved",
            decidedAt: "2026-09-08T17:00:00.000Z",
            decidedBy: "Patrick"
          })
        ]}
      />
    );
    expect(approvedOnly).toContain("No drafts awaiting approval");
    expect(approvedOnly).not.toContain(NOT_LIVE_LABEL);
  });

  it("renders a pending card inside the banner with body, diff, and Evidence link", () => {
    const html = renderToStaticMarkup(<PendingDrafts drafts={[draft()]} dev />);
    expect(html).toContain('class="drafts"');
    expect(html).toContain('class="draft"');
    expect(html).toContain(NOT_LIVE_LABEL);
    expect(html).toContain("from run");
    expect(html).toContain('href="/runs/run-20260908-aaa1?surface=ops"');
    expect(html).toContain("run-20260908-aaa1");
    expect(html).toContain("<h3>states · st-nv</h3>");
    expect(html).toContain("Nevada posture proposal body.");
    expect(html).toContain("Proposed change to the tracker");
    expect(html).toContain("Live now");
    expect(html).toContain("If approved");
    expect(html).toContain("<del>untracked</del>");
    expect(html).toContain("<ins>pending</ins>");
    expect(html).toContain("posture");
    expect(html).toContain("Open the evidence for this run");
    expect(html).toContain("Confidence 61/100");
    expect(html).toContain("Evals · ok");

    const lower = html.toLowerCase();
    expect(lower).not.toContain("sign in");
    expect(lower).not.toContain("log in");
    expect(html).not.toContain('type="password"');
  });

  it("uses the production ops. origin for Evidence links outside dev", () => {
    const html = renderToStaticMarkup(<PendingDrafts drafts={[draft()]} />);
    expect(html).toContain(
      'href="https://ops.predictionmarketlitigation.com/runs/run-20260908-aaa1"'
    );
    expect(html).not.toContain("?surface=");
  });

  it("flags tier-2-only, disagreement, and the designed confidence/eval empties", () => {
    const plain = renderToStaticMarkup(<PendingDrafts drafts={[draft()]} />);
    expect(plain).not.toContain("Tier-2 source only");
    expect(plain).not.toContain('class="warn"');

    const tier2 = renderToStaticMarkup(
      <PendingDrafts
        drafts={[
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
    expect(tier2).not.toContain("/100");
    expect(tier2).not.toContain("Evals ·");

    const flagged = renderToStaticMarkup(
      <PendingDrafts
        drafts={[
          draft({
            evalSummary: {
              ...draft().evalSummary!,
              status: "evals_not_run",
              disagreement: {
                flagged: true,
                description: "reviewer dissent"
              }
            }
          })
        ]}
      />
    );
    expect(flagged).toContain('class="warn"');
    expect(flagged).toContain("Reviewer disagreement");
    expect(flagged).toContain("Evals not run");
    expect(flagged).not.toContain("Evals · evals_not_run");
  });

  it("labels every field of a multi-field diff and designed-empties null values", () => {
    const html = renderToStaticMarkup(
      <PendingDrafts
        drafts={[
          draft({
            diff: {
              operationalStatus: { from: null, to: "go" },
              posture: { from: "pending", to: "restricted" }
            }
          })
        ]}
      />
    );
    expect(html).toContain('<span class="kicker">operationalStatus</span>');
    expect(html).toContain('<span class="kicker">posture</span>');
    expect(html).toContain('<span class="muted">—</span>');
    expect(html).toContain("<del>pending</del>");
    expect(html).toContain("<ins>go</ins>");
    expect(html).toContain("<ins>restricted</ins>");
  });

  it("renders explicit designed empties for a null-target title", () => {
    const html = renderToStaticMarkup(
      <PendingDrafts
        drafts={[
          draft({
            targetEntityType: null,
            targetEntityId: null
          })
        ]}
      />
    );
    expect(html).toContain("<h3>unspecified type · unspecified target</h3>");
  });

  it("archives rejected drafts with outcome and decision meta, never under the pending banner", () => {
    const html = renderToStaticMarkup(
      <PendingDrafts drafts={[draft(), REJECTED]} />
    );
    expect(html).toContain("Rejected archive");
    expect(html).toContain(
      "<strong>Rejected</strong> — proposed, never published"
    );
    expect(html).toContain(
      "Decided " + formatEtDateTime("2026-09-08T17:30:00.000Z")
    );
    expect(html).toContain("Decided by Patrick");
    expect(html).toContain("Massachusetts watch-note proposal, rejected.");
    expect(html).toContain(
      'href="https://ops.predictionmarketlitigation.com/runs/run-20260908-bbb2"'
    );
    expect(html.split(NOT_LIVE_LABEL).length - 1).toBe(1);
    expect(html).toContain("<h3>states · st-ma</h3>");
  });
});
