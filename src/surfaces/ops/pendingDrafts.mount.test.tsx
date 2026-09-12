// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftRecord } from "../../shared/schemas/run";
import { PendingDrafts } from "./PendingDrafts";

/**
 * Story 3.9 review follow-through: the live fetch wiring of `useDrafts`
 * (the RunLog pattern — fetch once, every() guard, fail closed). Static
 * markup coverage lives in pendingDrafts.test.tsx.
 */

function draftRecord(id: string): DraftRecord {
  return {
    id,
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
    updatedAt: "2026-09-08T16:05:00.000Z"
  };
}

type FetchStub = (
  input: string | URL,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

function scriptedResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn<FetchStub>(async () => scriptedResponse(body, ok));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PendingDrafts live fetch (jsdom mount)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("fetches GET /api/drafts on mount and renders the returned card", async () => {
    const fetchMock = stubFetch({ items: [draftRecord("draft-nv-1")] });

    render(<PendingDrafts />);
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/drafts");
    expect(document.body.textContent).toContain(
      "Nevada posture proposal body."
    );
    expect(document.body.textContent).toContain("Not live · awaiting approval");
    expect(document.body.textContent).not.toContain(
      "No drafts awaiting approval"
    );
  });

  it("fails closed to the EmptyState when the fetch is not OK", async () => {
    stubFetch(null, false);

    render(<PendingDrafts />);
    await act(async () => {});

    expect(document.body.textContent).toContain("No drafts awaiting approval");
    expect(document.body.textContent).not.toContain("Not live");
    expect(document.body.textContent).not.toContain("draft-nv-1");
  });

  it("fails closed to the EmptyState on a guard-failing payload", async () => {
    stubFetch({
      items: [
        {
          ...draftRecord("draft-broken"),
          confidence: 999,
          diff: "not an object"
        }
      ]
    });

    render(<PendingDrafts />);
    await act(async () => {});

    expect(document.body.textContent).toContain("No drafts awaiting approval");
    expect(document.body.textContent).not.toContain("draft-broken");
  });
});
