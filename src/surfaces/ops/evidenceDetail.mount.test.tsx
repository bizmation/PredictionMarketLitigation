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

describe("EvidenceDetail GET timeout (story 3.19, jsdom mount)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reaches the designed error state after 15 s when GET /api/runs/:id never resolves", async () => {
    const seen: AbortSignal[] = [];
    const fetchMock = vi.fn<FetchStub>((input, init) => {
      if (String(input).includes("/api/mode")) {
        return Promise.resolve(
          scriptedResponse({ status: 200, body: DEFAULT_APPROVAL_MODE })
        );
      }
      if (init?.signal) seen.push(init.signal);
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});
    expect(runCalls(fetchMock)).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Evidence unavailable");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(document.body.textContent).not.toContain("Evidence unavailable");
    expect(seen[0]?.aborted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    // Chrome plus the designed error, never a blank page.
    expect(seen[0]?.aborted).toBe(true);
    expect(seen[0]?.reason?.name).toBe("TimeoutError");
    expect(document.body.textContent).toContain("Evidence unavailable");
    expect(document.body.textContent).toContain(
      "The Evidence bundle could not be loaded."
    );
    expect(document.querySelector(".topbar")).not.toBeNull();
  });

  it("times out a hung poll GET during a live Run (never aborted by later ticks), keeps the held timeline per 3.8, and resumes polling", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn<FetchStub>((input, init) => {
      if (String(input).includes("/api/mode")) {
        return Promise.resolve(
          scriptedResponse({ status: 200, body: DEFAULT_APPROVAL_MODE })
        );
      }
      if (init?.signal) signals.push(init.signal);
      if (signals.length === 1) {
        return Promise.resolve(
          scriptedResponse({ status: 200, body: detail() })
        );
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});
    expect(document.body.textContent).toContain("run.started");

    // Second poll hangs; further ticks must not abort it or start another.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(runCalls(fetchMock)).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(runCalls(fetchMock)).toHaveLength(2);
    expect(signals[1]?.aborted).toBe(false);
    expect(document.body.textContent).toContain("run.started");

    // 15 s after the hung poll started (t = 4 s + 15 s).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(signals[1]?.aborted).toBe(true);
    expect(signals[1]?.reason?.name).toBe("TimeoutError");
    // A later-poll failure keeps the held detail (3.8 held-detail rule), so
    // the designed state here is the last known timeline, not the error
    // EmptyState — and the poll loop is free again.
    expect(document.body.textContent).toContain("run.started");
    expect(document.body.textContent).not.toContain("Evidence unavailable");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(runCalls(fetchMock)).toHaveLength(3);
    expect(signals[2]?.aborted).toBe(false);
  });

  it("reaches the designed error state when the first GET of a live Run hangs, with later ticks not aborting it", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn<FetchStub>((input, init) => {
      if (String(input).includes("/api/mode")) {
        return Promise.resolve(
          scriptedResponse({ status: 200, body: DEFAULT_APPROVAL_MODE })
        );
      }
      if (init?.signal) signals.push(init.signal);
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(runCalls(fetchMock)).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(signals[0]?.reason?.name).toBe("TimeoutError");
    expect(document.body.textContent).toContain("Evidence unavailable");
    expect(document.querySelector(".topbar")).not.toBeNull();
  });

  it("does not leak the deadline timer or show an error on unmount mid-fetch", async () => {
    const fetchMock = vi.fn<FetchStub>((input) => {
      if (String(input).includes("/api/mode")) {
        return Promise.resolve(
          scriptedResponse({ status: 200, body: DEFAULT_APPROVAL_MODE })
        );
      }
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<EvidenceDetail runId="run-20260908-aaa1" />);
    await act(async () => {});
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(document.body.textContent).not.toContain("Evidence unavailable");
    expect(runCalls(fetchMock)).toHaveLength(1);
  });
});

describe("mounted provider accounting labels", () => {
  afterEach(cleanup);
  it("keeps measured, estimated, legacy and uncertain amounts distinct", () => {
    const base = {
      runId: "run-20260908-aaa1",
      role: "drafter" as const,
      provider: "workersai",
      model: "test",
      tokens: null,
      costCents: 2,
      currency: "USD",
      createdAt: TS,
      admissionBoundCents: 2,
      estimatedCostCents: 1,
      reportedCostCents: null,
      reportedCostSource: null,
      policy: null,
      accountingIssue: null
    };
    render(
      <EvidenceDetail
        runId={base.runId}
        detail={detail({
          status: "awaiting",
          llmCalls: [
            { ...base, id: "estimated", costBasis: "token_estimate" },
            {
              ...base,
              id: "measured",
              provider: "openrouter",
              costBasis: "provider_reported",
              reportedCostCents: 2,
              reportedCostSource: "openrouter.usage.cost"
            },
            {
              ...base,
              id: "legacy",
              costBasis: "legacy_estimate",
              admissionBoundCents: null
            },
            {
              ...base,
              id: "uncertain",
              costBasis: "conservative_bound",
              estimatedCostCents: null,
              accountingIssue: "missing_or_invalid_token_usage"
            }
          ]
        })}
      />
    );
    const text = document.body.textContent;
    expect(text).toContain("Budget accounting · includes estimates");
    expect(text).toContain("Provider-reported charge: unknown");
    expect(text).toContain("Provider-reported charge: $0.02");
    expect(text).toContain("Estimate: $0.01");
    expect(text).toContain("historical estimate");
    expect(text).toContain("Admission bound: $0.02");
    expect(text).toContain(
      "Accounting uncertainty: Token usage is missing or invalid"
    );
  });
});
