// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftRecord } from "../shared/schemas/run";
import { Masthead } from "./apex/orientation/Masthead";
import { PendingDrafts } from "./ops/PendingDrafts";

const row = (
  id: string,
  overrides: Partial<DraftRecord> = {}
): DraftRecord => ({
  id,
  runId: "run-20260908-aaa1",
  targetEntityType: "states",
  targetEntityId: id,
  body: `Proposal ${id}`,
  diff: { posture: { from: "pending", to: "platform" } },
  tier2Only: false,
  confidence: null,
  evalSummary: null,
  readiness: "pending",
  outcome: null,
  decidedAt: null,
  decidedBy: null,
  editedBody: null,
  rejectReason: null,
  parentDraftId: null,
  revisionIndex: 0,
  createdAt: "2026-09-08T16:05:00.000Z",
  updatedAt: "2026-09-08T16:05:00.000Z",
  ...overrides
});
const response = (items: DraftRecord[]) => ({
  ok: true,
  json: async () => ({ items })
});
const flush = async () => {
  await act(async () => {});
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe.each(["masthead", "band"] as const)(
  "public Draft contract: %s",
  (surface) => {
    function mount() {
      return render(
        surface === "masthead" ? (
          <Masthead
            opsHref="https://ops-build.predictionmarketlitigation.com"
            kpis={null}
            developments={[]}
          />
        ) : (
          <PendingDrafts dev />
        )
      );
    }
    const status = () => screen.getByRole("status").textContent;
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("announces loading until a valid empty response; rejected archive is not pending", async () => {
      const pending = deferred<ReturnType<typeof response>>();
      const fetch = vi
        .fn()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValue(
          response([row("rejected", { outcome: "rejected" })])
        );
      vi.stubGlobal("fetch", fetch);
      mount();
      expect(status()).toBe("Loading pending drafts…");
      expect(document.body.textContent).not.toContain("0 pending");
      pending.resolve(response([]));
      await flush();
      expect(status()).toBe("Last successful snapshot: 0 pending drafts");
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(status()).toBe("Last successful snapshot: 0 pending drafts");
      if (surface === "band")
        expect(screen.getByText("Rejected archive")).toBeTruthy();
      expect(fetch.mock.calls[0]).toEqual([
        "/api/drafts",
        expect.objectContaining({
          cache: "no-store",
          signal: expect.any(AbortSignal)
        })
      ]);
    });

    it("refreshes revision heads and decisions via timer, focus and visibility, regardless of readiness", async () => {
      const initial = row("original");
      const revision = row("revision", {
        parentDraftId: "original",
        revisionIndex: 1,
        readiness: "unavailable"
      });
      const another = row("another", {
        readiness: "ready",
        confidence: 80,
        evalSummary: {
          status: "ok",
          basis: "All claims cited",
          citationCompleteness: 100,
          disagreement: { flagged: false, description: null },
          ineligible: []
        }
      });
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(response([initial]))
        .mockResolvedValueOnce(
          response([
            revision,
            another,
            row("rejected", { outcome: "rejected" }),
            row("approved", { outcome: "approved" }),
            row("edited", { outcome: "edited" })
          ])
        )
        .mockResolvedValueOnce(response([another]))
        .mockResolvedValueOnce(response([]));
      vi.stubGlobal("fetch", fetch);
      mount();
      await flush();
      expect(status()).toBe(
        "Last successful snapshot: 1 pending draft · Not live"
      );
      if (surface === "band")
        expect(screen.getByText("Evaluation in progress")).toBeTruthy();
      await act(() => vi.advanceTimersByTimeAsync(30_000));
      expect(status()).toBe(
        "Last successful snapshot: 2 pending drafts · Not live"
      );
      if (surface === "band") {
        expect(document.body.textContent).not.toContain("Proposal original");
        expect(screen.getByText("Proposal revision")).toBeTruthy();
        expect(screen.getByText("Evaluation unavailable")).toBeTruthy();
        expect(screen.getByText("Evals · ok")).toBeTruthy();
        expect(
          screen.getAllByText("Not live · awaiting approval")
        ).toHaveLength(2);
        expect(document.body.textContent).not.toContain("Proposal approved");
        expect(document.body.textContent).not.toContain("Proposal edited");
        expect(
          screen
            .getAllByRole("link", { name: "Open the evidence for this run" })[0]
            .getAttribute("href")
        ).toBe("/runs/run-20260908-aaa1?surface=ops");
      }
      fireEvent.focus(window);
      await flush();
      expect(status()).toBe(
        "Last successful snapshot: 1 pending draft · Not live"
      );
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange"));
      await flush();
      expect(fetch).toHaveBeenCalledTimes(3);
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      fireEvent(document, new Event("visibilitychange"));
      await flush();
      expect(status()).toBe("Last successful snapshot: 0 pending drafts");
    });

    it.each([
      "http",
      "network",
      "envelope",
      "record",
      "json",
      "duplicate",
      "timeout",
      "body timeout"
    ])("reports unavailable and retries after %s failure", async (failure) => {
      const fetch = vi.fn();
      if (failure === "http") fetch.mockResolvedValueOnce({ ok: false });
      if (failure === "network")
        fetch.mockRejectedValueOnce(new Error("offline"));
      if (failure === "envelope")
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      if (failure === "record")
        fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [row("bad", { confidence: 999 })] })
        });
      if (failure === "json")
        fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => {
            throw new Error("bad JSON");
          }
        });
      if (failure === "duplicate")
        fetch.mockResolvedValueOnce(response([row("same"), row("same")]));
      if (failure === "timeout")
        fetch.mockImplementationOnce(() => new Promise(() => {}));
      if (failure === "body timeout")
        fetch.mockResolvedValueOnce({
          ok: true,
          json: () => new Promise(() => {})
        });
      fetch.mockResolvedValue(response([row("recovered")]));
      vi.stubGlobal("fetch", fetch);
      mount();
      await flush();
      await act(() => vi.advanceTimersByTimeAsync(15_000));
      expect(status()).toBe("Pending drafts unavailable. Try again.");
      expect(document.body.textContent).not.toContain(
        "No drafts awaiting approval"
      );
      expect(document.body.textContent).not.toContain("0 pending");
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
      fireEvent.click(
        screen.getByRole("button", { name: "Retry pending drafts" })
      );
      await flush();
      expect(status()).toBe(
        "Last successful snapshot: 1 pending draft · Not live"
      );
    });

    it.each([0, 2])(
      "retains a clearly stale %s snapshot after a failed refresh and retry restores freshness",
      async (count) => {
        const fetch = vi
          .fn()
          .mockResolvedValueOnce(
            response(Array.from({ length: count }, (_, i) => row(`old-${i}`)))
          )
          .mockRejectedValueOnce(new Error("offline"))
          .mockResolvedValue(response([row("new")]));
        vi.stubGlobal("fetch", fetch);
        mount();
        await flush();
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(status()).toBe(
          `Stale — last successful snapshot: ${count} pending drafts${count > 0 ? " · Not live" : ""}. Current pending drafts unavailable.`
        );
        expect(document.body.textContent).not.toContain(
          "No drafts awaiting approval"
        );
        if (surface === "band" && count > 0)
          expect(screen.getByText("Proposal old-0")).toBeTruthy();
        fireEvent.click(
          screen.getByRole("button", { name: "Retry pending drafts" })
        );
        await flush();
        expect(status()).toBe(
          "Last successful snapshot: 1 pending draft · Not live"
        );
        expect(document.body.textContent).not.toContain("Stale");
      }
    );

    it.each([0, 2])(
      "keeps a %s snapshot stable during automatic reads, then bounds a stalled body and recovers without obsolete writes",
      async (count) => {
        const items = Array.from({ length: count }, (_, i) => row(`old-${i}`));
        const unchanged = deferred<{ items: DraftRecord[] }>();
        const obsolete = deferred<{ items: DraftRecord[] }>();
        const recovery = deferred<{ items: DraftRecord[] }>();
        const fetch = vi
          .fn()
          .mockResolvedValueOnce(response(items))
          .mockResolvedValueOnce({ ok: true, json: () => unchanged.promise })
          .mockResolvedValueOnce({ ok: true, json: () => obsolete.promise })
          .mockResolvedValueOnce({ ok: true, json: () => recovery.promise });
        vi.stubGlobal("fetch", fetch);
        const view = mount();
        await flush();
        const freshCopy = status();
        const emptyPanel =
          surface === "band" && count === 0
            ? view.container.querySelector(".empty")
            : null;
        const announcements: string[] = [];
        const observer = new MutationObserver(() => {
          announcements.push(status() ?? "");
        });
        observer.observe(screen.getByRole("status"), {
          childList: true,
          characterData: true,
          subtree: true
        });
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(status()).toBe(freshCopy);
        if (emptyPanel) {
          expect(view.container.querySelector(".empty")).toBe(emptyPanel);
          expect(emptyPanel.textContent).toContain(
            "Last successful snapshot had no drafts awaiting approval"
          );
        }
        unchanged.resolve({ items });
        await flush();
        expect(status()).toBe(freshCopy);
        expect(announcements).toEqual([]);
        observer.disconnect();
        await act(() => vi.advanceTimersByTimeAsync(30_000));
        expect(status()).toBe(freshCopy);
        if (emptyPanel)
          expect(view.container.querySelector(".empty")).toBe(emptyPanel);
        fireEvent.focus(window);
        await flush();
        expect(fetch).toHaveBeenCalledTimes(3);
        await act(() => vi.advanceTimersByTimeAsync(15_000));
        const staleCopy = `Stale — last successful snapshot: ${count} pending drafts${count > 0 ? " · Not live" : ""}. Current pending drafts unavailable.`;
        expect(status()).toBe(staleCopy);
        expect(fetch.mock.calls[2][1].signal.aborted).toBe(true);
        if (emptyPanel) {
          expect(view.container.querySelector(".empty")).toBe(emptyPanel);
          expect(emptyPanel.textContent).toContain(
            "Last successful snapshot had no drafts awaiting approval"
          );
        }
        const retry = screen.getByRole("button", {
          name: "Retry pending drafts"
        }) as HTMLButtonElement;
        expect(retry.disabled).toBe(false);
        fireEvent.click(retry);
        await flush();
        expect(status()).toBe(`${staleCopy} Retrying…`);
        expect(retry.disabled).toBe(true);
        fireEvent.click(retry);
        fireEvent.focus(window);
        await flush();
        expect(fetch).toHaveBeenCalledTimes(4);
        recovery.resolve({ items: [row("recovered")] });
        await flush();
        expect(status()).toBe(
          "Last successful snapshot: 1 pending draft · Not live"
        );
        expect(
          screen.queryByRole("button", { name: "Retry pending drafts" })
        ).toBeNull();
        obsolete.resolve({
          items: [row("obsolete-a"), row("obsolete-b"), row("obsolete-c")]
        });
        await flush();
        expect(status()).toBe(
          "Last successful snapshot: 1 pending draft · Not live"
        );
        expect(document.body.textContent).not.toContain("Proposal obsolete");
        if (surface === "band")
          expect(screen.getByText("Proposal recovered")).toBeTruthy();
      }
    );

    it("coalesces active refresh events and aborts/unsubscribes on unmount, ignoring late resolution", async () => {
      const pending = deferred<ReturnType<typeof response>>();
      const fetch = vi.fn().mockReturnValue(pending.promise);
      vi.stubGlobal("fetch", fetch);
      const view = mount();
      fireEvent.focus(window);
      fireEvent.focus(window);
      fireEvent(document, new Event("visibilitychange"));
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(fetch).toHaveBeenCalledTimes(1);
      view.unmount();
      await flush();
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      pending.resolve(response([row("late")]));
      await flush();
      fireEvent.focus(window);
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).not.toContain("Proposal late");
    });
  }
);

it("both mounted surfaces announce matching snapshots and isolate StrictMode's obsolete request", async () => {
  const obsolete = deferred<ReturnType<typeof response>>();
  const fetch = vi
    .fn()
    .mockReturnValueOnce(obsolete.promise)
    .mockResolvedValue(response([row("current")]));
  vi.stubGlobal("fetch", fetch);
  try {
    const view = render(
      <StrictMode>
        <section aria-label="apex">
          <Masthead opsHref="/?surface=ops" kpis={null} developments={[]} />
        </section>
        <section aria-label="ops">
          <PendingDrafts />
        </section>
      </StrictMode>
    );
    await flush();
    obsolete.resolve(response([]));
    await flush();
    expect(
      within(screen.getByRole("region", { name: "apex" })).getByRole("status")
        .textContent
    ).toBe("Last successful snapshot: 1 pending draft · Not live");
    expect(
      within(screen.getByRole("region", { name: "ops" })).getByRole("status")
        .textContent
    ).toBe("Last successful snapshot: 1 pending draft · Not live");
    expect(
      screen
        .getByRole("link", { name: "Inspect drafts on ops." })
        .getAttribute("href")
    ).toBe("/?surface=ops#drafts");
    view.unmount();
  } finally {
    cleanup();
    vi.unstubAllGlobals();
  }
});
