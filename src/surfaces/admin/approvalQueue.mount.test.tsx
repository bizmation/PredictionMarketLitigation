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
    parentDraftId: null,
    revisionIndex: 0,
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
      if (url.includes("/api/pipeline-config")) {
        return scripted({
          key: "poll_sources",
          version: 0,
          sources: [],
          history: []
        });
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

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/queue",
      expect.objectContaining({ credentials: "same-origin" })
    );
    const queueCalls = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === "/api/admin/queue"
    );
    expect(queueCalls).toHaveLength(1);
    expect(document.body.textContent).toContain(
      "Nevada posture proposal body."
    );
    expect(document.body.textContent).toContain("Awaiting");
    expect(document.body.textContent).toContain(
      "Privacy is chosen at submit and cannot be undone"
    );
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

    const decisionCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/decision")
    );
    expect(decisionCall![0]).toBe("/api/admin/drafts/d-a/decision");
    expect(JSON.parse(decisionCall![1]!.body as string)).toEqual({
      action: "approve"
    });
    const queueCalls = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === "/api/admin/queue"
    );
    expect(queueCalls).toHaveLength(2);
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

    const decisionCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/decision")
    );
    expect(decisionCalls).toHaveLength(0);
    const queueCalls = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === "/api/admin/queue"
    );
    expect(queueCalls).toHaveLength(1);
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

  it("keeps selected index after interrogation submit; J/K/A/E/R still work after blur", async () => {
    const items = [draftRecord("d-a"), draftRecord("d-b"), draftRecord("d-c")];
    const fetchMock = vi.fn(
      async (
        input: string | URL | Request,
        _init?: RequestInit
      ): Promise<ScriptedResponse> => {
        const url = String(input);
        if (url.includes("/steering")) {
          return scripted({
            id: "st-1",
            runId: "run-20260912-aaa1",
            draftId: "d-c",
            actor: "Patrick",
            role: "steward",
            content: "why skipped",
            reply: "federal-register was skipped",
            private: false,
            createdAt: "2026-09-12T16:05:00.000Z"
          });
        }
        return scripted({ items });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ApprovalQueue />);
    await act(async () => {});

    const buttons = () =>
      screen
        .getAllByRole("button")
        .filter((button) => button.className.includes("qitem"));
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "j" });
    expect(buttons()[2]!.getAttribute("aria-selected")).toBe("true");

    const composer = screen.getByLabelText("Steering turn");
    fireEvent.change(composer, { target: { value: "why skipped" } });
    fireEvent.keyDown(composer, { key: "j" });
    expect(buttons()[2]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Submit turn" }));
    await act(async () => {});

    expect(buttons()[2]!.getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).toContain("federal-register was skipped");

    fireEvent.blur(composer);
    fireEvent.keyDown(document, { key: "j" });
    expect(buttons()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).not.toContain(
      "federal-register was skipped"
    );
    fireEvent.keyDown(document, { key: "k" });
    expect(buttons()[2]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document, { key: "e" });
    expect(screen.getByLabelText("Edited draft body")).toBeTruthy();
  });

  it("reloads the queue and selects the revised tip; J/K still work after blur", async () => {
    const original = [
      draftRecord("d-a"),
      draftRecord("d-b"),
      draftRecord("d-c")
    ];
    const revisedTip = {
      ...draftRecord("d-c:r1"),
      body: "Revised Nevada holding."
    };
    const revised = [draftRecord("d-a"), draftRecord("d-b"), revisedTip];
    let queueItems = original;
    const fetchMock = vi.fn(
      async (
        input: string | URL | Request,
        _init?: RequestInit
      ): Promise<ScriptedResponse> => {
        const url = String(input);
        if (url.includes("/steering")) {
          queueItems = revised;
          return scripted({
            id: "st-1",
            runId: "run-20260912-aaa1",
            draftId: "d-c",
            actor: "Patrick",
            role: "steward",
            content: "tighten the holding",
            reply: null,
            private: false,
            revisedDraftId: "d-c:r1",
            createdAt: "2026-09-12T16:05:00.000Z"
          });
        }
        return scripted({ items: queueItems });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ApprovalQueue />);
    await act(async () => {});

    const buttons = () =>
      screen
        .getAllByRole("button")
        .filter((button) => button.className.includes("qitem"));
    fireEvent.keyDown(document, { key: "j" });
    fireEvent.keyDown(document, { key: "j" });
    expect(buttons()[2]!.getAttribute("aria-selected")).toBe("true");

    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "tighten the holding" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Revise draft" }));
    await act(async () => {});

    expect(buttons()).toHaveLength(3);
    expect(buttons()[2]!.getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).toContain("Revised Nevada holding.");
    expect(document.body.textContent).not.toContain(
      "Nevada posture proposal body."
    );

    fireEvent.keyDown(document, { key: "j" });
    expect(buttons()[0]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document, { key: "k" });
    expect(buttons()[2]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document, { key: "e" });
    expect(screen.getByLabelText("Edited draft body")).toBeTruthy();
  });

  it("ignores A/E/R while a revise submit is in flight", async () => {
    let resolveRevise: ((value: ScriptedResponse) => void) | undefined;
    const fetchMock = vi.fn(
      (
        input: string | URL | Request,
        _init?: RequestInit
      ): Promise<ScriptedResponse> => {
        const url = String(input);
        if (url.includes("/steering")) {
          return new Promise<ScriptedResponse>((resolve) => {
            resolveRevise = resolve;
          });
        }
        return Promise.resolve(scripted({ items: [draftRecord("d-a")] }));
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ApprovalQueue />);
    await act(async () => {});

    fireEvent.change(screen.getByLabelText("Steering turn"), {
      target: { value: "tighten the holding" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Revise draft" }));
    await act(async () => {});
    fireEvent.blur(screen.getByLabelText("Steering turn"));
    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "e" });
    fireEvent.keyDown(document, { key: "r" });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/decision"))
    ).toBe(false);
    expect(screen.queryByLabelText("Edited draft body")).toBeNull();
    expect(
      screen.queryByLabelText("Reject reason — published by default")
    ).toBeNull();

    await act(async () => {
      resolveRevise?.(
        scripted({
          id: "st-1",
          runId: "run-20260912-aaa1",
          draftId: "d-a",
          actor: "Patrick",
          role: "steward",
          content: "tighten the holding",
          reply: null,
          private: false,
          revisedDraftId: "d-a:r1",
          createdAt: "2026-09-12T16:05:00.000Z"
        })
      );
    });
  });
});
