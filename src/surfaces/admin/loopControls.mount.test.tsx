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
  vi.restoreAllMocks();
  vi.useRealTimers();
  sessionStorage.clear();
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
      supersedePriorPublish: true,
      requestId: expect.any(String),
      scheduledFor: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
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
      "Dispatch is unresolved. Check the identified Run before starting other work."
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

describe("identified dispatch recovery (3.33)", () => {
  it("restores unresolved dispatch on reload and retries only its Run", async () => {
    const run = item({ id: "run-20261113-0002", status: "running" });
    const dispatch = {
      runId: run.id,
      instanceId: `daily-${run.id}`,
      state: "uncertain",
      instanceStatus: null,
      ownsDate: true,
      canResolve: true
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST")
          return scripted({
            run,
            dispatch: {
              ...dispatch,
              state: "confirmed",
              instanceStatus: "running"
            }
          });
        return scripted({ latest: run, dispatches: [dispatch] });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    expect(document.body.textContent).toContain("dispatch uncertain");
    fireEvent.click(
      screen.getByRole("button", { name: `Check / retry ${run.id}` })
    );
    await act(async () => {});
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]![0]).toBe(`/api/admin/runs/${run.id}/dispatch`);
    expect(JSON.parse(String(posts[0]![1]?.body))).toEqual({ action: "check" });
    expect(document.body.textContent).not.toContain("not started");
  });
  it("retains the request identity after an unknown response", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        init?.method === "POST"
          ? scripted({ code: "internal" }, false)
          : scripted({ latest: null })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Run now" }));
      await act(async () => {});
    }
    const posts = fetchMock.mock.calls.filter((c) => c[1]?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(JSON.parse(String(posts[0]![1]?.body)).requestId).toBe(
      JSON.parse(String(posts[1]![1]?.body)).requestId
    );
  });
});

describe("durable manual request identity", () => {
  it("keeps the same request and ET date after midnight and remount even when the original Run finished", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T04:59:59.000Z"));
    let accepted = false;
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST")
          return scripted({ code: "unknown" }, false, 503);
        return scripted({
          latest: accepted ? item({ status: "empty" }) : null,
          dispatches: []
        });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    first.unmount();
    accepted = true;
    vi.setSystemTime(new Date("2026-11-14T05:01:00.000Z"));
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    const requests = fetchMock.mock.calls
      .filter((c) => c[1]?.method === "POST")
      .map((c) => JSON.parse(String(c[1]?.body)));
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(requests[1]);
    expect(requests[1].scheduledFor).toBe("2026-11-13");
  });
  it("does not dispatch if its retry identity cannot be persisted", async () => {
    const fetchMock = vi.fn(async () => scripted({ latest: null }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("No new request was sent");
  });
  it("clears the saved identity after a confirmed response, allowing a distinct later request", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        init?.method === "POST"
          ? scripted(item({ origin: "manual", status: "running" }))
          : scripted({ latest: null })
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Run now" }));
      await act(async () => {});
    }
    const requests = fetchMock.mock.calls
      .filter((c) => c[1]?.method === "POST")
      .map((c) => JSON.parse(String(c[1]?.body)));
    expect(requests).toHaveLength(2);
    expect(requests[0].requestId).not.toBe(requests[1].requestId);
    expect(sessionStorage.getItem("pml.pending-run-request")).toBeNull();
  });
});

it("does not discard another unresolved request when checking a different Run", async () => {
  const pending = {
    requestId: "held-request",
    scheduledFor: "2026-11-13",
    runId: "run-20261113-0002"
  };
  sessionStorage.setItem("pml.pending-run-request", JSON.stringify(pending));
  const other = "run-20261114-0002";
  const dispatch = {
    runId: other,
    instanceId: `daily-${other}`,
    state: "confirmed",
    instanceStatus: "running",
    ownsDate: true,
    canResolve: false
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      scripted(
        init?.method === "POST"
          ? { dispatch }
          : { latest: null, dispatches: [dispatch] }
      )
    )
  );
  render(<LoopControls />);
  await act(async () => {});
  fireEvent.click(
    screen.getByRole("button", { name: `Check / retry ${other}` })
  );
  await act(async () => {});
  expect(
    JSON.parse(sessionStorage.getItem("pml.pending-run-request")!)
  ).toEqual(pending);
});

describe("tab-local request recovery and confirmation", () => {
  it("isolates another tab without losing the first tab's pending request", async () => {
    const firstStorage = window.sessionStorage;
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        init?.method === "POST"
          ? scripted({ code: "unknown" }, false, 503)
          : scripted({ latest: null })
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    const saved = firstStorage.getItem("pml.pending-run-request");
    expect(saved).not.toBeNull();
    first.unmount();
    const secondData = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => secondData.get(key) ?? null,
      setItem: (key: string, value: string) => secondData.set(key, value),
      removeItem: (key: string) => secondData.delete(key),
      clear: () => secondData.clear()
    });
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    const posts = fetchMock.mock.calls
      .filter((c) => c[1]?.method === "POST")
      .map((c) => JSON.parse(String(c[1]?.body)));
    expect(posts[0].requestId).not.toBe(posts[1].requestId);
    expect(firstStorage.getItem("pml.pending-run-request")).toBe(saved);
    expect(
      JSON.parse(secondData.get("pml.pending-run-request")!).requestId
    ).toBe(posts[1].requestId);
    firstStorage.clear();
  });
  it("removes Cancel after uncertain supersede submission and retries the retained identity", async () => {
    let posts = 0;
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST") {
          if (++posts === 1)
            return scripted({ code: "supersede_required" }, false, 409);
          throw new Error("response lost");
        }
        return scripted({ latest: item() });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    fireEvent.click(
      screen.getByRole("button", { name: "Supersede prior publish" })
    );
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    const saved = sessionStorage.getItem("pml.pending-run-request");
    expect(saved).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    const requests = fetchMock.mock.calls
      .filter((c) => c[1]?.method === "POST")
      .map((c) => JSON.parse(String(c[1]?.body)));
    expect(requests).toHaveLength(3);
    expect(requests[1].supersedePriorPublish).toBe(true);
    expect(requests[2].requestId).toBe(requests[1].requestId);
    expect(sessionStorage.getItem("pml.pending-run-request")).toBe(saved);
  });
  it("Cancel clears only the identity belonging to its confirmation dialog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
        init?.method === "POST"
          ? scripted({ code: "supersede_required" }, false, 409)
          : scripted({ latest: item() })
      )
    );
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await act(async () => {});
    const replacement = {
      requestId: "another-control",
      scheduledFor: "2026-11-15"
    };
    sessionStorage.setItem(
      "pml.pending-run-request",
      JSON.stringify(replacement)
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {});
    expect(
      JSON.parse(sessionStorage.getItem("pml.pending-run-request")!)
    ).toEqual(replacement);
  });
  it.each(["resolved", "confirmed"])(
    "clears its matching saved request after %s recovery and starts a fresh request",
    async (state) => {
      const runId = "run-20261113-0002";
      const pending = {
        requestId: "matching-old-request",
        scheduledFor: "2026-11-13",
        runId
      };
      sessionStorage.setItem(
        "pml.pending-run-request",
        JSON.stringify(pending)
      );
      const dispatch = {
        runId,
        instanceId: `daily-${runId}`,
        state: "uncertain",
        instanceStatus: null,
        ownsDate: true,
        canResolve: true
      };
      let recovered = false;
      const fetchMock = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "POST") {
            if (String(input).endsWith("/dispatch")) {
              recovered = true;
              return scripted({
                dispatch: {
                  ...dispatch,
                  state,
                  ownsDate: state !== "resolved",
                  instanceStatus: state === "confirmed" ? "running" : null
                }
              });
            }
            return scripted(item({ origin: "manual", status: "running" }));
          }
          return scripted({
            latest: null,
            dispatches: recovered ? [] : [dispatch]
          });
        }
      );
      vi.stubGlobal("fetch", fetchMock);
      render(<LoopControls />);
      await act(async () => {});
      fireEvent.click(
        screen.getByRole("button", {
          name: `${state === "resolved" ? "Fence and close" : "Check / retry"} ${runId}`
        })
      );
      await act(async () => {});
      expect(document.body.textContent).toContain(`dispatch ${state}`);
      expect(sessionStorage.getItem("pml.pending-run-request")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Run now" }));
      await act(async () => {});
      const submission = fetchMock.mock.calls.find(
        (c) => c[0] === "/api/admin/runs" && c[1]?.method === "POST"
      )!;
      expect(JSON.parse(String(submission[1]?.body)).requestId).not.toBe(
        pending.requestId
      );
    }
  );

  it("confirms the undecided count before rejecting and ignores J, K, A, E, and R", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          return scripted({
            runId: "run-20261111-0000",
            status: "rejected",
            rejectedCount: 4
          });
        }
        return scripted({
          latest: item({
            status: "awaiting",
            completedAt: null,
            approvalOutcome: null
          }),
          pendingHeadCount: 4,
          dispatches: []
        });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    for (const key of ["j", "k", "a", "e", "r"]) {
      fireEvent.keyDown(document.body, { key });
    }
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes("/reject"))
    ).toBe(false);
    const open = screen.getByRole("button", { name: "Reject this run" });
    expect(open.getAttribute("accesskey")).toBeNull();
    fireEvent.click(open);
    expect(document.body.textContent).toContain(
      "Reject 4 undecided drafts in run-20261111-0000?"
    );
    expect(document.body.textContent).toContain("Nothing will be published.");
    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
    await act(async () => {});
    const post = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/reject")
    );
    expect(post?.[0]).toBe("/api/admin/runs/run-20261111-0000/reject");
    expect(post?.[1]?.method).toBe("POST");
  });

  it("closes the confirm step after a timeout when a different awaiting run loads", async () => {
    let posted = false;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          posted = true;
          throw new DOMException(
            "Request timed out after 30000 ms",
            "TimeoutError"
          );
        }
        return scripted({
          latest: item({
            id: posted ? "run-20261112-0001" : "run-20261111-0000",
            status: "awaiting",
            completedAt: null,
            approvalOutcome: null
          }),
          pendingHeadCount: posted ? 2 : 4,
          dispatches: []
        });
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("No answer within 30 seconds");
    expect(document.body.textContent).toContain("run-20261112-0001");
    expect(document.body.textContent).not.toContain(
      "Reject 2 undecided drafts"
    );
    expect(
      screen.getByRole("button", { name: "Reject this run" })
    ).toBeTruthy();
  });

  it("does not reopen the confirm step after the session returns from a 403", async () => {
    let posted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          posted = true;
          return scripted({ code: "forbidden" }, false, 403);
        }
        if (!posted) {
          return scripted({
            latest: item({
              status: "awaiting",
              completedAt: null,
              approvalOutcome: null
            }),
            pendingHeadCount: 4,
            dispatches: []
          });
        }
        return scripted({
          latest: item({
            status: "awaiting",
            completedAt: null,
            approvalOutcome: null
          }),
          pendingHeadCount: 4,
          dispatches: []
        });
      })
    );
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
    await act(async () => {});
    expect(document.body.textContent).not.toContain(
      "Reject 4 undecided drafts"
    );
    expect(
      screen.getByRole("button", { name: "Reject this run" })
    ).toBeTruthy();
  });

  it("hides reject after success while the next loop read still says awaiting", async () => {
    const gate: { release: (() => void) | null } = { release: null };
    let posted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          posted = true;
          return scripted({
            runId: "run-20261111-0000",
            status: "rejected",
            rejectedCount: 4
          });
        }
        if (posted) {
          await new Promise<void>((resolve) => {
            gate.release = resolve;
          });
        }
        return scripted({
          latest: item({
            status: "awaiting",
            completedAt: null,
            approvalOutcome: null
          }),
          pendingHeadCount: 4,
          dispatches: []
        });
      })
    );
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(
      "Run run-20261111-0000 rejected. 4 drafts were rejected."
    );
    expect(
      screen.queryByRole("button", { name: "Reject this run" })
    ).toBeNull();
    gate.release?.();
    await act(async () => {});
  });

  function loopGets(fetchMock: { mock: { calls: unknown[][] } }): number {
    return fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/admin/loop")
    ).length;
  }

  function awaitingLoop(pendingHeadCount: number) {
    return scripted({
      latest: item({
        status: "awaiting",
        completedAt: null,
        approvalOutcome: null
      }),
      pendingHeadCount,
      dispatches: []
    });
  }

  it("closes the confirm step when reject returns 409 for the same run", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          return scripted(
            { code: "conflict", message: "Run cannot be rejected." },
            false,
            409
          );
        }
        return awaitingLoop(4);
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    const before = loopGets(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("This run cannot be rejected.");
    expect(document.body.textContent).not.toContain(
      "Reject did not complete. The run is unchanged until you confirm it again."
    );
    expect(document.body.textContent).not.toContain(
      "Reject 4 undecided drafts"
    );
    expect(
      screen.getByRole("button", { name: "Reject this run" })
    ).toBeTruthy();
    expect(loopGets(fetchMock)).toBe(before + 1);
  });

  it("keeps the confirm step open when reject returns 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          return scripted({ code: "internal_error" }, false, 500);
        }
        return awaitingLoop(4);
      })
    );
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Reject did not complete. The run is unchanged until you confirm it again."
    );
    expect(document.body.textContent).toContain(
      "Reject 4 undecided drafts in run-20261111-0000?"
    );
    expect(
      screen.getByRole("button", { name: "Reject 4 drafts" })
    ).toBeTruthy();
  });

  it("closes the confirm step after a timeout when the same awaiting run reloads", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          throw new DOMException(
            "Request timed out after 30000 ms",
            "TimeoutError"
          );
        }
        return awaitingLoop(4);
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
    await act(async () => {});
    expect(document.body.textContent).toContain("No answer within 30 seconds");
    expect(document.body.textContent).toContain("run-20261111-0000");
    expect(document.body.textContent).not.toContain(
      "Reject 4 undecided drafts"
    );
    expect(
      screen.getByRole("button", { name: "Reject this run" })
    ).toBeTruthy();
  });

  it("closes the confirm step and reloads when reject returns 404", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          return scripted({ code: "not_found" }, false, 404);
        }
        return awaitingLoop(4);
      }
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<LoopControls />);
    await act(async () => {});
    const before = loopGets(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject 4 drafts" }));
    await act(async () => {});
    expect(document.body.textContent).not.toContain(
      "Reject did not complete. The run is unchanged until you confirm it again."
    );
    expect(document.body.textContent).not.toContain(
      "This run cannot be rejected."
    );
    expect(document.body.textContent).not.toContain(
      "Reject 4 undecided drafts"
    );
    expect(
      screen.getByRole("button", { name: "Reject this run" })
    ).toBeTruthy();
    expect(loopGets(fetchMock)).toBe(before + 1);
  });

  it("uses singular copy when one undecided draft is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reject") && init?.method === "POST") {
          return scripted({
            runId: "run-20261111-0000",
            status: "rejected",
            rejectedCount: 1
          });
        }
        return awaitingLoop(1);
      })
    );
    render(<LoopControls />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Reject this run" }));
    expect(document.body.textContent).toContain(
      "Reject 1 undecided draft in run-20261111-0000?"
    );
    expect(document.body.textContent).toContain("Nothing will be published.");
    expect(document.body.textContent).not.toContain("undecided drafts");
    fireEvent.click(screen.getByRole("button", { name: "Reject 1 draft" }));
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "Run run-20261111-0000 rejected. 1 draft was rejected."
    );
    expect(document.body.textContent).not.toContain("drafts were rejected");
  });
});
