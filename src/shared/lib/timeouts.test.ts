import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_POST_TIMEOUT_MS,
  CLIENT_GET_TIMEOUT_MS,
  CONNECTOR_TIMEOUT_MS,
  DeadlineError,
  PROVIDER_TIMEOUT_MS,
  fetchWithTimeout,
  isAbortError,
  isTimeoutError,
  withDeadline
} from "./timeouts";

/**
 * Story 3.19 — the timeout helpers under fake timers. Both helpers schedule
 * with `setTimeout`, so `vi.advanceTimersByTimeAsync` is the clock.
 */

type FetchStub = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function okResponse(): Response {
  return new Response("ok", { status: 200 });
}

describe("timeout constants (story 3.19)", () => {
  it("pins the four deadlines decided in the sprint change proposal", () => {
    expect(CLIENT_GET_TIMEOUT_MS).toBe(15_000);
    expect(ADMIN_POST_TIMEOUT_MS).toBe(30_000);
    expect(CONNECTOR_TIMEOUT_MS).toBe(60_000);
    expect(PROVIDER_TIMEOUT_MS).toBe(60_000);
  });
});

describe("withDeadline (story 3.19)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the value when the promise settles first and clears the timer", async () => {
    const result = await withDeadline(Promise.resolve(42), 1_000, "fast");
    expect(result).toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rethrows the promise's own rejection untouched", async () => {
    const boom = new Error("boom");
    await expect(
      withDeadline(Promise.reject(boom), 1_000, "fails")
    ).rejects.toBe(boom);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with DeadlineError naming the label once the deadline passes", async () => {
    const hung = new Promise<never>(() => {});
    const raced = withDeadline(hung, 5_000, "workersai");
    const settled = raced.then(
      () => "resolved",
      (err: unknown) => err
    );
    await vi.advanceTimersByTimeAsync(4_999);
    await vi.advanceTimersByTimeAsync(1);
    const err = await settled;
    expect(err).toBeInstanceOf(DeadlineError);
    expect((err as DeadlineError).label).toBe("workersai");
    expect((err as DeadlineError).ms).toBe(5_000);
    expect(String(err)).toContain("workersai");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("fetchWithTimeout (story 3.19)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("passes the call through and resolves when fetch resolves in time", async () => {
    const fetchMock = vi.fn<FetchStub>(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithTimeout(
      "/api/runs",
      { headers: { accept: "application/json" } },
      15_000
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.headers).toEqual({ accept: "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with a TimeoutError and aborts the passed signal once the deadline passes", async () => {
    let seen: AbortSignal | undefined;
    const fetchMock = vi.fn<FetchStub>(
      (_input, init) =>
        new Promise<Response>((_, reject) => {
          seen = init?.signal ?? undefined;
          seen?.addEventListener("abort", () => reject(seen?.reason));
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const settled = fetchWithTimeout("/api/runs/x", undefined, 15_000).then(
      () => "resolved",
      (err: unknown) => err
    );
    await vi.advanceTimersByTimeAsync(14_999);
    expect(seen?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await settled;
    expect(isTimeoutError(err)).toBe(true);
    expect(isAbortError(err)).toBe(false);
    expect(seen?.aborted).toBe(true);
    expect(seen?.reason?.name).toBe("TimeoutError");
  });

  it("still rejects on time when the fetch implementation ignores the signal", async () => {
    const fetchMock = vi.fn<FetchStub>(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const settled = fetchWithTimeout("/api/mode", undefined, 1_000).then(
      () => "resolved",
      (err: unknown) => err
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(isTimeoutError(await settled)).toBe(true);
  });

  it("keeps the caller's abort as an AbortError, not a TimeoutError, and clears the timer", async () => {
    const fetchMock = vi.fn<FetchStub>(
      (_input, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason)
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const settled = fetchWithTimeout(
      "/api/drafts",
      { signal: controller.signal },
      15_000
    ).then(
      () => "resolved",
      (err: unknown) => err
    );
    controller.abort();
    const err = await settled;
    expect(isAbortError(err)).toBe(true);
    expect(isTimeoutError(err)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    // The deadline never fires after an unmount abort.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still times out and still honours caller abort when AbortSignal.any is unavailable", async () => {
    const original = AbortSignal.any;
    // @ts-expect-error — simulate Safari < 17.4 / Chrome < 116.
    delete AbortSignal.any;
    try {
      expect(typeof AbortSignal.any).toBe("undefined");
      const seen: AbortSignal[] = [];
      const fetchMock = vi.fn<FetchStub>(
        (_input, init) =>
          new Promise<Response>((_, reject) => {
            const s = init?.signal;
            if (s) {
              seen.push(s);
              // Real fetch rejects at once on an already-aborted signal.
              if (s.aborted) reject(s.reason);
              s.addEventListener("abort", () => reject(s.reason));
            }
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      // Timeout path.
      const controller = new AbortController();
      const timedOut = fetchWithTimeout(
        "/api/runs",
        { signal: controller.signal },
        1_000
      ).then(
        () => "resolved",
        (err: unknown) => err
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(isTimeoutError(await timedOut)).toBe(true);
      expect(seen[0]?.reason?.name).toBe("TimeoutError");
      expect(controller.signal.aborted).toBe(false);

      // Caller-abort path.
      const second = new AbortController();
      const aborted = fetchWithTimeout(
        "/api/drafts",
        { signal: second.signal },
        1_000
      ).then(
        () => "resolved",
        (err: unknown) => err
      );
      second.abort();
      expect(isAbortError(await aborted)).toBe(true);
      expect(seen[1]?.reason?.name).toBe("AbortError");
      expect(vi.getTimerCount()).toBe(0);

      // Already-aborted caller signal.
      const third = new AbortController();
      third.abort();
      const pre = fetchWithTimeout(
        "/api/mode",
        { signal: third.signal },
        1_000
      ).then(
        () => "resolved",
        (err: unknown) => err
      );
      expect(isAbortError(await pre)).toBe(true);
      expect(seen[2]?.aborted).toBe(true);
    } finally {
      AbortSignal.any = original;
    }
  });

  it("does not abort the caller's own controller when the deadline fires", async () => {
    const fetchMock = vi.fn<FetchStub>(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const settled = fetchWithTimeout(
      "/api/admin/loop",
      { signal: controller.signal },
      15_000
    ).then(
      () => "resolved",
      (err: unknown) => err
    );
    await vi.advanceTimersByTimeAsync(15_000);
    expect(isTimeoutError(await settled)).toBe(true);
    expect(controller.signal.aborted).toBe(false);
  });
});
