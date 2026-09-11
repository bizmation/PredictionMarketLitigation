import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  DraftRecord,
  EvidenceEvent,
  RunDetail
} from "../../shared/schemas/run";
import type { LlmCallRecord } from "../../shared/schemas/gateway";
import { NOT_LIVE_LABEL } from "../../shared/ui";
import {
  EvidenceDetail,
  evidenceStepClass,
  mapEvidenceFetch,
  runIdFromOpsPath
} from "./EvidenceDetail";

const TS = "2026-09-08T16:00:00.000Z";
const TS_STEP = "2026-09-08T16:01:00.000Z";
const TS_DONE = "2026-09-08T16:05:00.000Z";

function event(
  overrides: Partial<EvidenceEvent> &
    Pick<EvidenceEvent, "id" | "event" | "seq">
): EvidenceEvent {
  return {
    runId: "run-20260908-aaa1",
    payload: null,
    createdAt: TS_STEP,
    ...overrides
  };
}

function call(
  overrides: Partial<LlmCallRecord> & Pick<LlmCallRecord, "id">
): LlmCallRecord {
  return {
    runId: "run-20260908-aaa1",
    role: "drafter",
    provider: "workersai",
    model: "llama-3-8b",
    tokens: { input: 11, output: 7 },
    costCents: 0,
    currency: "USD",
    createdAt: TS_STEP,
    ...overrides
  };
}

function draft(
  overrides: Partial<DraftRecord> & Pick<DraftRecord, "id">
): DraftRecord {
  return {
    runId: "run-20260908-aaa1",
    targetEntityType: "states",
    targetEntityId: "st-nv",
    diff: {},
    body: "Proposed update for Nevada.",
    tier2Only: false,
    confidence: 80,
    evalSummary: {
      status: "ok",
      basis: "Tier-1 citation holds.",
      citationCompleteness: 90,
      disagreement: { flagged: false, description: null },
      ineligible: []
    },
    outcome: null,
    decidedAt: null,
    decidedBy: null,
    editedBody: null,
    createdAt: TS_STEP,
    updatedAt: TS_STEP,
    ...overrides
  };
}

function detail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: "run-20260908-aaa1",
    origin: "scheduled",
    mode: "hitl",
    status: "awaiting",
    startedAt: TS,
    completedAt: TS_DONE,
    spendCents: 47,
    spendCurrency: "USD",
    budgetCents: 200,
    scheduledFor: "2026-09-08",
    drafts: [draft({ id: "draft-1" })],
    evidence: [
      event({ id: "ev-0", seq: 0, event: "run.started", createdAt: TS }),
      event({
        id: "ev-1",
        seq: 1,
        event: "source.fetched",
        payload: { source: "courtlistener" }
      }),
      event({
        id: "ev-2",
        seq: 2,
        event: "guardrails.failed",
        payload: { tool: "publish_f1", ruleId: "tool.allowlist" }
      }),
      event({ id: "ev-3", seq: 3, event: "gate.awaiting_approval" })
    ],
    llmCalls: [call({ id: "call-1" })],
    ...overrides
  };
}

function noLogin(html: string) {
  const lower = html.toLowerCase();
  expect(lower).not.toContain("sign in");
  expect(lower).not.toContain("log in");
  expect(html).not.toContain('type="password"');
}

describe("runIdFromOpsPath", () => {
  it("reads a single /runs/:runId segment and ignores other paths", () => {
    expect(runIdFromOpsPath("/runs/run-20260908-aaa1")).toBe(
      "run-20260908-aaa1"
    );
    expect(runIdFromOpsPath("/runs/run-20260908-aaa1/")).toBe(
      "run-20260908-aaa1"
    );
    expect(runIdFromOpsPath("/runs/run-20260908-aaa1/extra")).toBeNull();
    expect(runIdFromOpsPath("/")).toBeNull();
  });
});

describe("mapEvidenceFetch", () => {
  it("maps 404 to missing and other non-OK to error", () => {
    expect(mapEvidenceFetch(404, { id: "ignored" })).toEqual({
      view: "missing",
      shouldPoll: false
    });
    expect(mapEvidenceFetch(500, null).view).toBe("error");
    expect(mapEvidenceFetch(0, undefined).view).toBe("error");
    expect(mapEvidenceFetch(503, {}).shouldPoll).toBe(false);
  });

  it("accepts a RunDetail body and polls only while running", () => {
    const awaiting = detail();
    expect(mapEvidenceFetch(200, awaiting)).toEqual({
      view: awaiting,
      shouldPoll: false
    });
    const running = detail({ status: "running", completedAt: null });
    expect(mapEvidenceFetch(200, running)).toEqual({
      view: running,
      shouldPoll: true
    });
  });

  it("maps an invalid body to error", () => {
    expect(mapEvidenceFetch(200, { id: "nope" })).toEqual({
      view: "error",
      shouldPoll: false
    });
  });

  it("keeps a held RunDetail when a later fetch fails", () => {
    const running = detail({ status: "running", completedAt: null });
    expect(mapEvidenceFetch(500, null, running)).toEqual({
      view: running,
      shouldPoll: true
    });
    expect(mapEvidenceFetch(404, null, running).view).toBe(running);
    expect(mapEvidenceFetch(0, undefined, running).view).toBe(running);
    expect(mapEvidenceFetch(200, { id: "nope" }, running).view).toBe(running);
  });
});

describe("evidenceStepClass", () => {
  it("marks the last seq now while running and done historically", () => {
    expect(evidenceStepClass("running", 0, 1)).toBe("done");
    expect(evidenceStepClass("running", 1, 1)).toBe("now");
    expect(evidenceStepClass("awaiting", 1, 1)).toBe("done");
    expect(evidenceStepClass("empty", 0, 0)).toBe("done");
  });
});

describe("EvidenceDetail (story 3.8)", () => {
  it("renders Evidence chrome on first paint with no invented Run", () => {
    const html = renderToStaticMarkup(
      <EvidenceDetail runId="run-20260908-aaa1" />
    );
    expect(html).toContain('id="evidence"');
    expect(html).toContain("Run evidence");
    expect(html).toContain('class="topbar"');
    expect(html).not.toContain('class="steps"');
    expect(html).not.toContain('class="spend"');
    expect(html).not.toContain("sources → draft → guardrails → gate");
    noLogin(html);
  });

  it("renders timeline, spend, models, draft, lineage, tools, and export href with no login chrome", () => {
    const html = renderToStaticMarkup(
      <EvidenceDetail runId="run-20260908-aaa1" detail={detail()} dev />
    );

    expect(html).toContain("run-20260908-aaa1");
    expect(html).toContain('class="steps"');
    expect(html).toContain('class="done"');
    expect(html).not.toContain('class="now"');
    expect(html).toContain("run.started");
    expect(html).toContain("source.fetched · courtlistener");
    expect(html).toContain("guardrails.failed · publish_f1");
    expect(html).toContain("$0.47");
    expect(html).toContain(">18<");
    expect(html).toContain("drafter · workersai · llama-3-8b");
    expect(html).toContain("not recorded");
    expect(html).toContain("Proposed update for Nevada.");
    expect(html).toContain(NOT_LIVE_LABEL);
    expect(html).toContain("sources → draft → guardrails → gate → awaiting");
    expect(html).toContain("hitl");
    expect(html).toContain("none — not approved");
    expect(html).toContain('href="/api/runs/run-20260908-aaa1"');
    expect(html).toContain('download="run-20260908-aaa1.json"');
    expect(html).toContain("Export JSON");
    expect(html).toContain("ok");
    expect(html).toContain("Tier-1 citation holds.");
    expect(html).not.toContain("Evals not run");
    expect(html).not.toContain("No draft produced");
    noLogin(html);
  });

  it("keeps $0.00, evals-not-run, and No draft produced on an empty Run", () => {
    const html = renderToStaticMarkup(
      <EvidenceDetail
        runId="run-20260908-bbb2"
        detail={detail({
          id: "run-20260908-bbb2",
          status: "empty",
          spendCents: 0,
          drafts: [],
          llmCalls: [],
          evidence: [
            event({
              id: "ev-0",
              seq: 0,
              event: "run.started",
              runId: "run-20260908-bbb2"
            }),
            event({
              id: "ev-1",
              seq: 1,
              event: "run.empty",
              runId: "run-20260908-bbb2"
            })
          ]
        })}
      />
    );

    expect(html).toContain("$0.00");
    expect(html).toContain("Evals not run");
    expect(html).toContain("An empty eval is not a passing eval.");
    expect(html).toContain("No draft produced");
    expect(html).toContain("not recorded");
    expect(html).toContain("sources → draft → guardrails → gate → empty");
    expect(html).not.toContain(NOT_LIVE_LABEL);
    noLogin(html);
  });

  it("shows the disagreement flag and description when flagged", () => {
    const html = renderToStaticMarkup(
      <EvidenceDetail
        runId="run-20260908-aaa1"
        detail={detail({
          drafts: [
            draft({
              id: "draft-1",
              evalSummary: {
                status: "ok",
                basis: "Tier-1 citation holds.",
                citationCompleteness: 90,
                disagreement: {
                  flagged: true,
                  description: "Drafter overstated the holding."
                },
                ineligible: []
              }
            })
          ]
        })}
      />
    );

    expect(html).toContain("Flagged");
    expect(html).toContain("Drafter overstated the holding.");
    expect(html).toContain("Disagreement flag");
  });

  it("renders EmptyState for an unknown id and does not invent a Run", () => {
    const html = renderToStaticMarkup(
      <EvidenceDetail runId="run-20260908-dead" detail="missing" />
    );
    expect(html).toContain("Run not found");
    expect(html).toContain("This page does not invent a Run.");
    expect(html).not.toContain('class="steps"');
    expect(html).not.toContain('class="spend"');
    expect(html).not.toContain("sources → draft → guardrails → gate");
    noLogin(html);
  });

  it("renders EmptyState on fetch failure without fake Evidence", () => {
    const html = renderToStaticMarkup(
      <EvidenceDetail runId="run-20260908-aaa1" detail="error" />
    );
    expect(html).toContain("Evidence unavailable");
    expect(html).not.toContain('class="steps"');
    expect(html).not.toContain("Proposed update");
    noLogin(html);
  });

  it("marks the last step now while the Run is running", () => {
    const html = renderToStaticMarkup(
      <EvidenceDetail
        runId="run-20260908-aaa1"
        detail={detail({
          status: "running",
          completedAt: null,
          drafts: [],
          evidence: [
            event({ id: "ev-0", seq: 0, event: "run.started", createdAt: TS }),
            event({ id: "ev-1", seq: 1, event: "source.fetched" })
          ]
        })}
      />
    );
    expect(html).toContain('class="done"');
    expect(html).toContain('class="now"');
    expect(html).toContain("running");
  });

  it("shows the editedBody diff when present", () => {
    const html = renderToStaticMarkup(
      <EvidenceDetail
        runId="run-20260908-aaa1"
        detail={detail({
          drafts: [
            draft({
              id: "draft-1",
              outcome: "edited",
              decidedBy: "P. Bland",
              decidedAt: TS_DONE,
              editedBody: "Operator-corrected Nevada text."
            })
          ]
        })}
      />
    );
    expect(html).toContain('class="diff"');
    expect(html).toContain("Operator-corrected Nevada text.");
    expect(html).toContain("Human-approved");
    expect(html).toContain("P. Bland");
    expect(html).not.toContain(NOT_LIVE_LABEL);
    expect(html).not.toContain("none — not approved");
  });
});
