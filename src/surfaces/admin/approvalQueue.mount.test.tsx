// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DraftRecord } from "../../shared/schemas/run";
import { ApprovalQueue } from "./ApprovalQueue";

/**
 * Story 3.10 — the live fetch and keyboard wiring of the admin queue
 * (useAdminSession pattern: same-origin, abort on unmount, fail closed).
 * Static markup coverage lives in approvalQueue.test.tsx.
 */

function draftRecord(id: string): DraftRecord {
  return {
    id,
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
    updatedAt: "2026-09-12T16:05:00.000Z"
  };
}

type ScriptedResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function scripted(
  body: unknown,
  ok = true,
  status = ok ? 200 : 500
): ScriptedResponse {
  return { ok, status, json: async () => body };
}

function decided(record: DraftRecord): DraftRecord {
  return {
    ...record,
    outcome: "approved",
    decidedAt: "2026-09-12T17:00:00.000Z",
    decidedBy: "Patrick"
  };
}

type DecisionOption = {
  ok?: boolean;
  status?: number;
  body?: unknown;
};

function stubQueueFetch(
  items: unknown[],
  decision: DecisionOption,
  onDecision?: () => void
) {
  let queueOk = true;
  const mock = vi.fn(
    async (
      input: string | URL | Request,
      _init?: RequestInit
    ): Promise<ScriptedResponse> => {
      const url = String(input);
      if (url.includes("/decision")) {
        onDecision?.();
        const decisionStatus =
          decision.status ?? (decision.ok === false ? 500 : 200);
        if (decisionStatus === 403) queueOk = false;
        return scripted(
          decision.body ?? {},
          decision.ok ?? true,
          decisionStatus
        );
      }
      return scripted(
        { items: queueOk ? items : null },
        queueOk,
        queueOk ? 200 : 403
      );
    }
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ApprovalQueue live fetch and keyboard (jsdom mount)", () => {
  it("fetches GET /api/admin/queue with the session on mount and renders it", async () => {
    const fetchMock = stubQueueFetch([draftRecord("d-a")], {
      body: decided(draftRecord("d-a"))
    });

    render(<ApprovalQueue />);
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/queue");
    expect(fetchMock.mock.calls[0]![1]?.credentials).toBe("same-origin");
    expect(document.body.textContent).toContain(
      "Nevada posture proposal body."
    );
    expect(document.body.textContent).toContain("Awaiting");
  });

  it("fails closed to the re-auth EmptyState when the fetch is not OK", async () => {
    const fetchMock = vi.fn(async () => scripted(null, false, 403));
    vi.stubGlobal("fetch", fetchMock);

    render(<ApprovalQueue />);
    await act(async () => {});

    expect(document.body.textContent).toContain(
      "Operator re-authentication needed"
    );
    expect(document.body.textContent).toContain(
      "This queue answers only to a verified operator identity."
    );
    expect(document.body.textContent).not.toContain("d-a");
  });

  it("renders the designed EmptyState for an empty queue", async () => {
    stubQueueFetch([], { body: {} });

    render(<ApprovalQueue />);
    await act(async () => {});

    expect(document.body.textContent).toContain("Nothing awaiting approval");
    expect(document.body.textContent).toContain(
      "An empty queue means the pipeline proposed nothing, not that it failed."
    );
  });

  it("J and K move the selection, and both are ignored while typing", async () => {
    stubQueueFetch([draftRecord("d-a"), draftRecord("d-b")], { body: {} });
    render(<ApprovalQueue />);
    await act(async () => {});

    const buttons = () =>
      screen
        .getAllByRole("button")
        .filter((button) => button.className.includes("qitem"));
    expect(buttons()[0]!.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(document, { key: "j" });
    expect(buttons()[1]!.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(document, { key: "k" });
    expect(buttons()[0]!.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(document, { key: "e" });
    const editor = screen.getByLabelText("Edited draft body");
    fireEvent.keyDown(editor, { key: "j" });
    fireEvent.keyDown(editor, { key: "k" });
    expect(buttons()[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("A posts an approve decision and refreshes the queue", async () => {
    const fetchMock = stubQueueFetch([draftRecord("d-a")], {
      body: decided(draftRecord("d-a"))
    });
    render(<ApprovalQueue />);
    await act(async () => {});

    fireEvent.keyDown(document, { key: "a" });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const decisionCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/decision")
    );
    expect(decisionCall![0]).toBe("/api/admin/drafts/d-a/decision");
    expect(JSON.parse(decisionCall![1]!.body as string)).toEqual({
      action: "approve"
    });
    expect(String(fetchMock.mock.calls[2]![0])).toBe("/api/admin/queue");
  });

  it("E opens the editor prefilled with the body; approving posts the edit", async () => {
    const fetchMock = stubQueueFetch([draftRecord("d-a")], {
      body: {
        ...decided(draftRecord("d-a")),
        outcome: "edited",
        editedBody: "Operator revision."
      }
    });
    render(<ApprovalQueue />);
    await act(async () => {});

    fireEvent.keyDown(document, { key: "e" });
    const editor = screen.getByLabelText("Edited draft body");
    expect((editor as HTMLTextAreaElement).value).toBe(
      "Nevada posture proposal body."
    );
    expect(document.body.textContent).toContain(
      "The original draft is preserved. Approving from here publishes both versions and the diff on ops."
    );

    fireEvent.change(editor, { target: { value: "Operator revision." } });
    fireEvent.keyDown(document, { key: "a" });
    await act(async () => {});

    const decisionCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/decision")
    );
    expect(JSON.parse(decisionCall![1]!.body as string)).toEqual({
      action: "edit",
      editedBody: "Operator revision."
    });
  });

  it("R opens the reject box; confirming posts the reason and the private flag", async () => {
    const fetchMock = stubQueueFetch([draftRecord("d-a")], {
      body: {
        ...decided(draftRecord("d-a")),
        outcome: "rejected",
        rejectReason: "Not a docket event."
      }
    });
    render(<ApprovalQueue />);
    await act(async () => {});

    fireEvent.keyDown(document, { key: "r" });
    const reason = screen.getByLabelText(
      "Reject reason — published by default"
    );
    expect(document.body.textContent).toContain(
      "Mark reason private — the rejection stays public, only this text is withheld"
    );

    const confirm = screen.getByRole("button", { name: "Confirm rejection" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(reason, { target: { value: "Not a docket event." } });
    fireEvent.click(
      screen.getByLabelText(
        "Mark reason private — the rejection stays public, only this text is withheld"
      )
    );
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    await act(async () => {});

    const decisionCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/decision")
    );
    expect(JSON.parse(decisionCall![1]!.body as string)).toEqual({
      action: "reject",
      rejectReason: "Not a docket event.",
      private: true
    });
  });

  it("fails a 403 decision closed to re-auth with no fake success and refetches", async () => {
    const fetchMock = stubQueueFetch([draftRecord("d-a")], {
      ok: false,
      status: 403,
      body: { code: "forbidden" }
    });
    render(<ApprovalQueue />);
    await act(async () => {});

    fireEvent.keyDown(document, { key: "a" });
    await act(async () => {});

    expect(document.body.textContent).toContain(
      "Operator re-authentication needed"
    );
    expect(document.body.textContent).not.toContain("Resolved");
    const queueCalls = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === "/api/admin/queue"
    );
    expect(queueCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces a 409 as already-decided, not as success", async () => {
    stubQueueFetch([draftRecord("d-a")], {
      ok: false,
      status: 409,
      body: { code: "conflict" }
    });
    render(<ApprovalQueue />);
    await act(async () => {});

    fireEvent.keyDown(document, { key: "a" });
    await act(async () => {});

    expect(document.body.textContent).toContain(
      "That draft was already decided — the queue has refreshed."
    );
    expect(document.body.textContent).not.toContain("Resolved.");
  });

  it("ignores A when a modifier is held — Ctrl+A posts no decision", async () => {
    const fetchMock = stubQueueFetch([draftRecord("d-a")], { body: {} });
    render(<ApprovalQueue />);
    await act(async () => {});

    fireEvent.keyDown(document, { key: "a", ctrlKey: true });
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const decisionCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/decision")
    );
    expect(decisionCalls).toHaveLength(0);
    expect(document.body.textContent).toContain("Awaiting");
  });

  it("resets the reject box after confirming, before the next draft", async () => {
    stubQueueFetch([draftRecord("d-a"), draftRecord("d-b")], {
      body: {
        ...decided(draftRecord("d-a")),
        outcome: "rejected",
        rejectReason: "Not a docket event."
      }
    });
    render(<ApprovalQueue />);
    await act(async () => {});

    fireEvent.keyDown(document, { key: "r" });
    const firstReason = screen.getByLabelText(
      "Reject reason — published by default"
    );
    fireEvent.change(firstReason, { target: { value: "Not a docket event." } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    await act(async () => {});

    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "r" });
    await act(async () => {});

    const nextReason = screen.getByLabelText(
      "Reject reason — published by default"
    ) as HTMLTextAreaElement;
    expect(nextReason.value).toBe("");
    const confirm = screen.getByRole("button", { name: "Confirm rejection" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });
});
