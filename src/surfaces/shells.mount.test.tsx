// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APPROVAL_MODE } from "../shared/schemas/mode";
import type { DraftRecord } from "../shared/schemas/run";
import { AdminShell } from "./admin/AdminShell";
import { OpsShell } from "./ops/OpsShell";

const YOLO_MODE = { ...DEFAULT_APPROVAL_MODE, mode: "yolo" as const };

function stubMode(body: unknown, ok = true, queue: DraftRecord[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/mode")) {
        return {
          ok,
          status: ok ? 200 : 500,
          json: async () => body
        };
      }
      if (url.includes("/api/admin/queue")) {
        return { ok: true, status: 200, json: async () => ({ items: queue }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    })
  );
}

/** Story 3.21 — a docket-event Draft whose drafter confidence is 0.75. */
function docketDraft(): DraftRecord {
  return {
    id: "d-docket",
    runId: "run-20260912-aaa1",
    targetEntityType: "docket_events",
    targetEntityId: "de-case-ri-furcolo-501",
    diff: {
      caseId: "case-ri-furcolo",
      occurredAt: "2026-09-15",
      description: "ORDER granting Motion for Preliminary Injunction.",
      sourceUrl: "https://www.courtlistener.com/docket/73375343/x/?entry=12",
      entryNumber: 12,
      inference: {
        kind: "pi-granted",
        favors: "platform",
        confidence: 0.75,
        basis: "ORDER granting"
      },
      statePatch: { posture: { from: "pending", to: "platform" } }
    },
    body: "KalshiEX LLC v. Furcolo — docket entry 12",
    tier2Only: false,
    confidence: 80,
    evalSummary: {
      status: "ok",
      basis: "holds",
      citationCompleteness: 100,
      disagreement: { flagged: false, description: null },
      ineligible: ["posture_flip"]
    },
    outcome: null,
    decidedAt: null,
    decidedBy: null,
    editedBody: null,
    rejectReason: null,
    parentDraftId: null,
    revisionIndex: 0,
    createdAt: "2026-09-12T16:05:00.000Z",
    updatedAt: "2026-09-12T16:05:00.000Z"
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shell TrustBar live mode (jsdom mount)", () => {
  it("keeps HITL/70 and does not imply YOLO when GET /api/mode is not OK", async () => {
    stubMode(null, false);
    render(<OpsShell items={[]} drafts={[]} />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: HITL");
    expect(document.body.textContent).toContain("HITL — human in the loop");
    expect(document.body.textContent).toContain("auto-approve threshold 70");
    expect(document.body.textContent).not.toContain("Gate: YOLO");
    expect(document.body.textContent).not.toContain("YOLO — autonomous");
  });

  it("shows Gate: YOLO on ops when GET /api/mode is yolo", async () => {
    stubMode(YOLO_MODE);
    render(<OpsShell items={[]} drafts={[]} />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: YOLO");
    expect(document.body.textContent).not.toContain("Gate: HITL");
  });

  it("feeds the live threshold into the approval queue's Accept/Strip defaults (story 3.21)", async () => {
    stubMode({ ...DEFAULT_APPROVAL_MODE, threshold: 85 }, true, [
      docketDraft()
    ]);
    render(<AdminShell />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Auto-approve threshold85");
    const rows = document
      .querySelector('[data-testid="accept-strip"]')!
      .querySelectorAll("li");
    expect(rows.length).toBeGreaterThan(0);
    expect(
      [...rows].every((row) => row.textContent?.includes("Stripped"))
    ).toBe(true);
  });

  it("shows Gate: YOLO on admin when GET /api/mode is yolo", async () => {
    stubMode(YOLO_MODE);
    render(<AdminShell />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: YOLO");
    expect(document.body.textContent).toContain("Autonomous ON — YOLO");
    expect(document.body.textContent).not.toContain("Gate: HITL");
  });

  it("updates the admin TrustBar after a successful mode toggle POST", async () => {
    let liveMode = DEFAULT_APPROVAL_MODE;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/admin/mode") && init?.method === "POST") {
          liveMode = {
            ...DEFAULT_APPROVAL_MODE,
            mode: "yolo",
            audit: [
              {
                id: "a-toggle",
                createdAt: "2026-09-13T16:00:00.000Z",
                actorDisplayName: "Patrick",
                kind: "mode",
                prior: { mode: "hitl" },
                next: { mode: "yolo" }
              }
            ]
          };
          return {
            ok: true,
            status: 200,
            json: async () => liveMode
          };
        }
        if (url.includes("/api/mode")) {
          return {
            ok: true,
            status: 200,
            json: async () => liveMode
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      })
    );
    render(<AdminShell />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: HITL");
    expect(document.body.textContent).toContain("Autonomous OFF");
    fireEvent.click(
      document.querySelector('button[aria-label="Autonomous mode"]')!
    );
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: YOLO");
    expect(document.body.textContent).toContain("Autonomous ON — YOLO");
    expect(document.body.textContent).not.toContain("Autonomous OFF");
  });
});
