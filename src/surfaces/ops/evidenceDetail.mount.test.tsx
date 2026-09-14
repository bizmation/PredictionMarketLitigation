// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APPROVAL_MODE } from "../../shared/schemas/mode";
import type { RunDetail } from "../../shared/schemas/run";
import { EvidenceDetail } from "./EvidenceDetail";

/**
 * Story 3.8 review follow-up: the only executable coverage of the live
 * fetch/poll wiring (initial GET, 4s poll while running, held-detail survival,
 * abort + interval cleanup). Every other EvidenceDetail test renders via
 * `renderToStaticMarkup`, which never runs effects.
 */

const TS = "2026-09-08T16:00:00.000Z";

function detail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: "run-20260908-aaa1",
    origin: "scheduled",
    mode: "hitl",
    status: "running",
    startedAt: TS,
    completedAt: null,
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: 200,
    scheduledFor: "2026-09-08",
    drafts: [],
    evidence: [
      {
        id: "ev-0",
        runId: "run-20260908-aaa1",
        seq: 0,
        event: "run.started",
        payload: null,
        createdAt: TS
      }
    ],
    llmCalls: [],
    ...overrides
  };
}

const COMPLETED = { status: "awaiting", completedAt: TS } as const;

type Scripted = { status: number; body: unknown };

type FetchStub = (
  input: string | URL,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

function scriptedResponse(step: Scripted) {
  return {
    ok: step.status >= 200 && step.status <= 299,
    status: step.status,
    json: async () => step.body
  };
}

function stubFetch(
  script: Scripted[],
  mode: { ok?: boolean; body?: unknown } = {}
) {
  let call = 0;
  const fetchMock = vi.fn<FetchStub>(async (input) => {
    if (String(input).includes("/api/mode")) {
      const ok = mode.ok ?? true;
      return {
        ok,
        status: ok ? 200 : 500,
        json: async () => mode.body ?? DEFAULT_APPROVAL_MODE
      };
    }
    const step = script[Math.min(call, script.length - 1)]!;
    call += 1;
    return scriptedResponse(step);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function runCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) =>
    String(input).includes("/api/runs/")
  );
}

describe("EvidenceDetail live fetch/poll (jsdom mount)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fetches GET /api/runs/:id on mount and renders the RunDetail", async () => {
    const fetchMock = stubFetch([{ status: 200, body: detail(COMPLETED) }]);

    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});

    expect(runCalls(fetchMock)).toHaveLength(1);
    expect(runCalls(fetchMock)[0]![0]).toBe("/api/runs/run-20260908-aaa1");
    expect(document.body.textContent).toContain("run-20260908-aaa1");
    expect(document.body.textContent).toContain("run.started");
    expect(document.body.textContent).not.toContain("Evidence unavailable");
  });

  it("renders the EmptyState when the first GET fails, without polling", async () => {
    const fetchMock = stubFetch([{ status: 500, body: null }]);

    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});

    expect(document.body.textContent).toContain("Evidence unavailable");
    expect(document.body.textContent).not.toContain("run.started");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(runCalls(fetchMock)).toHaveLength(1);
  });

  it("polls every 4s while running and stops once the Run completes", async () => {
    const fetchMock = stubFetch([
      { status: 200, body: detail() },
      { status: 200, body: detail() },
      { status: 200, body: detail(COMPLETED) }
    ]);

    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});
    expect(runCalls(fetchMock)).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(runCalls(fetchMock)).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(runCalls(fetchMock)).toHaveLength(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(runCalls(fetchMock)).toHaveLength(3);
  });

  it("keeps the held timeline when a later poll fails, and keeps polling", async () => {
    const fetchMock = stubFetch([
      { status: 200, body: detail() },
      { status: 500, body: null },
      { status: 200, body: detail(COMPLETED) }
    ]);

    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(runCalls(fetchMock)).toHaveLength(2);
    expect(document.body.textContent).toContain("run-20260908-aaa1");
    expect(document.body.textContent).toContain("run.started");
    expect(document.body.textContent).not.toContain("Evidence unavailable");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(runCalls(fetchMock)).toHaveLength(3);
  });

  it("aborts an in-flight poll on unmount and stops scheduling", async () => {
    const calls: Array<{ signal?: AbortSignal }> = [];
    const fetchMock = vi.fn<FetchStub>(async (input, init) => {
      if (String(input).includes("/api/mode")) {
        return scriptedResponse({
          status: 200,
          body: DEFAULT_APPROVAL_MODE
        });
      }
      calls.push({ signal: init?.signal });
      if (calls.length === 1) {
        return scriptedResponse({ status: 200, body: detail() });
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.signal?.aborted).toBe(false);

    unmount();
    expect(calls[1]!.signal?.aborted).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(calls).toHaveLength(2);
  });

  it("keeps Gate: HITL and never implies YOLO when GET /api/mode is not OK", async () => {
    stubFetch([{ status: 200, body: detail(COMPLETED) }], { ok: false });
    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: HITL");
    expect(document.body.textContent).not.toContain("Gate: YOLO");
  });

  it("shows Gate: YOLO on Evidence chrome when live mode is yolo", async () => {
    stubFetch([{ status: 200, body: detail(COMPLETED) }], {
      body: { ...DEFAULT_APPROVAL_MODE, mode: "yolo" }
    });
    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});
    expect(document.body.textContent).toContain("Gate: YOLO");
    expect(document.body.textContent).not.toContain("Gate: HITL");
  });
});
