// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCaseDetail } from "./cases/useCaseDetail";
import { useCircuitData } from "./circuits/useCircuitData";
import { usePoll } from "./poll/usePoll";

/**
 * Story 3.19 — the apex hooks under a hung fetch. Every hook goes through
 * `fetchWithTimeout` (15 s); a request that never resolves must land in the
 * hook's designed error/empty state, and one-at-a-time latches must release.
 */

const VOTE = { cert: "yes" } as const;

function hungFetch() {
  const fetchMock = vi.fn(() => new Promise<never>(() => {}));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apex hooks hung fetch (story 3.19, jsdom renderHook)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("useCaseDetail: a hung GET reaches status error after 15 s", async () => {
    hungFetch();
    const { result } = renderHook(() => useCaseDetail("case-1"));
    await act(async () => {});
    expect(result.current.status).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(result.current.status).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.detail).toBeNull();
  });

  it("useCircuitData: hung list GETs settle to listsReady with empty lists after 15 s", async () => {
    const fetchMock = hungFetch();
    const { result } = renderHook(() => useCircuitData());
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.listsReady).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    // Designed empty state: the board renders "nothing yet", never a blank
    // spinner forever.
    expect(result.current.listsReady).toBe(true);
    expect(result.current.circuits).toEqual([]);
    expect(result.current.states).toEqual([]);
    expect(result.current.cases).toEqual([]);
  });

  it("usePoll: a hung vote POST releases the inFlight latch after 15 s so a second vote posts", async () => {
    const posts: RequestInit[] = [];
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(init);
        return new Promise<never>(() => {});
      }
      return Promise.resolve(
        new Response(JSON.stringify({ cert: {}, terms: {} }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePoll());
    await act(async () => {});

    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.vote(VOTE);
    });
    expect(posts).toHaveLength(1);

    // Latched: a double-click during the hang posts nothing.
    let second = true;
    await act(async () => {
      second = await result.current.vote(VOTE);
    });
    expect(second).toBe(false);
    expect(posts).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(await first).toBe(false);

    // Released: the next vote issues a second POST.
    act(() => {
      void result.current.vote(VOTE);
    });
    expect(posts).toHaveLength(2);
  });
});
