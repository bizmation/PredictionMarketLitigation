// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunLogItem } from "../../shared/schemas/run";
import {
  LOOP_TIMEOUT_NOTICE,
  LoopControls,
  RUN_TIMEOUT_NOTICE
} from "./LoopControls";

function item(overrides: Partial<RunLogItem> = {}): RunLogItem {
  return {
    id: "run-20261111-0000",
    origin: "scheduled",
    mode: "hitl",
    status: "published",
    startedAt: "2026-11-11T16:00:00.000Z",
    completedAt: "2026-11-11T16:05:00.000Z",
    spendCents: 0,
    spendCurrency: "USD",
    budgetCents: null,
    scheduledFor: "2026-11-11",
    eventCount: 1,
    approvalOutcome: "approved",
    ...overrides
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoopControls live fetch (jsdom mount)", () => {
  it("fails closed to the re-auth EmptyState when the loop GET is not OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => scripted(null, false, 403))
    );
    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Operator re-authentication needed"
    );
    expect(document.body.textContent).not.toContain("Run now");
  });

  it("shows No runs yet and Run now when the loop GET returns latest null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => scripted({ latest: null }))
    );
    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toContain("No runs yet.");
    expect(document.body.textContent).toContain("Run now");
    expect(document.body.textContent).not.toContain(
      "Operator re-authentication needed"
    );
  });

  it("asks to supersede prior publish and confirms with the flag", async () => {
    const prior = item();
    const successor = item({
      id: "run-20261111-0002",
      origin: "manual",
      status: "running",
      completedAt: null,
      eventCount: 1,
      approvalOutcome: null
    });
    let superseded = false;
    const fetchMock = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<ScriptedResponse> => {
        const url = String(input);
        if (url.includes("/api/admin/runs")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            supersedePriorPublish?: boolean;
          };
          if (body.supersedePriorPublish === true) {
            superseded = true;
            return scripted(successor);
          }
          return scripted(
            {
              code: "supersede_required",
              message: "Confirm supersede of the prior published Run.",
              details: { priorRunId: "run-20261111-0000" }
            },
            false,
            409
          );
        }
        return scripted({ latest: superseded ? successor : prior });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("Supersede prior publish");
    expect(document.body.textContent).not.toContain("Run now");

    fireEvent.click(
      screen.getByRole("button", { name: "Supersede prior publish" })
    );
    await act(async () => {});
    const confirmCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/api/admin/runs")
        ? JSON.parse(String(call[1]?.body ?? "{}")).supersedePriorPublish ===
          true
        : false
    );
    expect(confirmCall).toBeDefined();
    expect(JSON.parse(String(confirmCall![1]?.body))).toEqual({
      origin: "manual",
      supersedePriorPublish: true
    });
    expect(document.body.textContent).toContain("run-20261111-0002");
    expect(document.body.textContent).toContain("running");
    expect(document.body.textContent).toContain("Run now");
    expect(document.body.textContent).not.toContain("Supersede prior publish");
  });

  it("shows the new manual running Run after a successful Run now", async () => {
    const started = item({
      id: "run-20261112-0002",
      origin: "manual",
      status: "running",
      completedAt: null,
      scheduledFor: "2026-11-12",
      eventCount: 0,
      approvalOutcome: null
    });
    let posted = false;
    const fetchMock = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<ScriptedResponse> => {
        const url = String(input);
        if (url.includes("/api/admin/runs") && init?.method === "POST") {
          posted = true;
          return scripted(started);
        }
        return scripted({ latest: posted ? started : null });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toContain("No runs yet.");
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("run-20261112-0002");
    expect(document.body.textContent).toContain("running");
    expect(document.body.textContent).toMatch(/manual/i);
    expect(document.body.textContent).not.toContain("No runs yet.");
  });

  it("reloads live/last after a non-OK Run now", async () => {
    const failed = item({
      id: "run-20261113-0002",
      origin: "manual",
      status: "failed",
      completedAt: "2026-11-13T16:01:00.000Z",
      scheduledFor: "2026-11-13",
      eventCount: 1,
      approvalOutcome: null
    });
    let posted = false;
    const fetchMock = vi.fn(
      async (
        input: string | URL | Request,
        init?: RequestInit
      ): Promise<ScriptedResponse> => {
        const url = String(input);
        if (url.includes("/api/admin/runs") && init?.method === "POST") {
          posted = true;
          return scripted(
            { code: "internal", message: "workflow unavailable" },
            false,
            500
          );
        }
        return scripted({ latest: posted ? failed : null });
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toContain("No runs yet.");
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "The run was not started. Try again."
    );
    expect(document.body.textContent).toContain("run-20261113-0002");
    expect(document.body.textContent).toContain("failed");
    const loopGets = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/admin/loop")
    );
    expect(loopGets.length).toBeGreaterThanOrEqual(2);
  });
});

describe("LoopControls timeouts (story 3.19, jsdom mount)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the timed-out EmptyState, not re-auth, when the loop GET hangs 15 s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toBe("");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(document.body.textContent).toContain("Loop status did not load");
    expect(document.body.textContent).not.toContain(
      "Operator re-authentication needed"
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("keeps the held row with LOOP_TIMEOUT_NOTICE when a poll hangs 15 s, and clears the notice once a poll succeeds", async () => {
    vi.useFakeTimers();
    const running = item({
      id: "run-20261111-0002",
      status: "running",
      completedAt: null,
      approvalOutcome: null
    });
    let gets = 0;
    const fetchMock = vi.fn(() => {
      gets += 1;
      if (gets === 2) return new Promise<never>(() => {});
      return Promise.resolve(scripted({ latest: running }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toContain("run-20261111-0002");

    // 4 s poll hangs; 15 s later it times out but the row is held.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(gets).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(document.body.textContent).toContain("run-20261111-0002");
    expect(document.body.textContent).toContain(LOOP_TIMEOUT_NOTICE);
    expect(document.body.textContent).not.toContain("Loop status did not load");

    // Next successful poll clears the stale-notice.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(gets).toBeGreaterThanOrEqual(3);
    expect(document.body.textContent).not.toContain(LOOP_TIMEOUT_NOTICE);
    expect(document.body.textContent).toContain("run-20261111-0002");
  });

  it("clears busy and shows a notice when POST /api/admin/runs hangs 30 s", async () => {
    vi.useFakeTimers();
    let posts = 0;
    const fetchMock = vi.fn((_input: string | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts += 1;
        return new Promise<never>(() => {});
      }
      return Promise.resolve(scripted({ latest: null }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    const runNow = screen.getByRole("button", { name: "Run now" });
    fireEvent.click(runNow);
    await act(async () => {});
    expect(posts).toBe(1);
    expect((runNow as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect((runNow as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(document.body.textContent).toContain(RUN_TIMEOUT_NOTICE);
    const after = screen.getByRole("button", { name: "Run now" });
    expect((after as HTMLButtonElement).disabled).toBe(false);
    // The GET reload after the timeout keeps the controls on the loop row.
    expect(document.body.textContent).toContain("No runs yet.");
  });
});
