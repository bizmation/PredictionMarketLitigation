import { useCallback, useEffect, useRef, useState } from "react";

import type { DraftRecord } from "../schemas/run";
import { parsePublicDrafts, selectPublicDrafts } from "./publicDrafts";
import { CLIENT_GET_TIMEOUT_MS, withDeadline } from "./timeouts";

export const PUBLIC_DRAFT_REFRESH_MS = 30_000;

type PublicDraftState = {
  drafts: DraftRecord[] | null;
  status: "loading" | "fresh" | "error" | "stale";
  refreshing: boolean;
};

/** One lifecycle for both public surfaces, including cross-host changes. */
export function usePublicDrafts(injectedDrafts?: DraftRecord[]) {
  const [state, setState] = useState<PublicDraftState>({
    drafts: null,
    status: "loading",
    refreshing: false
  });
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const injected = injectedDrafts !== undefined;

  useEffect(() => {
    if (injected) return;
    let disposed = false;
    let active: AbortController | null = null;

    const read = async () => {
      if (disposed || active) return;
      const controller = new AbortController();
      active = controller;
      setState((previous) => ({ ...previous, refreshing: true }));
      let onAbort = () => {};
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        // Bound the whole read, including a stalled response body, and abort
        // its transport on timeout/unmount. No cached membership snapshots.
        const drafts = await withDeadline(
          Promise.race([
            (async () => {
              const response = await fetch("/api/drafts", {
                signal: controller.signal,
                cache: "no-store",
                headers: { accept: "application/json" }
              });
              if (!response.ok)
                throw new Error("Public Draft feed unavailable");
              return parsePublicDrafts(await response.json());
            })(),
            aborted
          ]),
          CLIENT_GET_TIMEOUT_MS,
          "Public Draft feed"
        );
        if (!disposed) setState({ drafts, status: "fresh", refreshing: false });
      } catch {
        if (!disposed) {
          setState((previous) => ({
            ...previous,
            status: previous.drafts === null ? "error" : "stale",
            refreshing: false
          }));
        }
      } finally {
        controller.signal.removeEventListener("abort", onAbort);
        controller.abort();
        active = null;
      }
    };

    const request = () => {
      void read();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    refreshRef.current = request;
    request();
    const interval = setInterval(request, PUBLIC_DRAFT_REFRESH_MS);
    window.addEventListener("focus", request);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      refreshRef.current = () => {};
      active?.abort();
      clearInterval(interval);
      window.removeEventListener("focus", request);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [injected]);

  return {
    ...(injectedDrafts === undefined
      ? state
      : {
          drafts: injectedDrafts,
          status: "fresh" as const,
          refreshing: false
        }),
    refresh
  };
}

/** Keep count/readiness semantics and freshness language identical. */
export function publicDraftsStatus(state: PublicDraftState): string {
  if (state.status === "loading") return "Loading pending drafts…";
  if (state.drafts === null) {
    return state.refreshing
      ? "Pending drafts unavailable — retrying…"
      : "Pending drafts unavailable. Try again.";
  }
  const count = selectPublicDrafts(state.drafts).pending.length;
  const summary = `${count} pending ${count === 1 ? "draft" : "drafts"}${count > 0 ? " · Not live" : ""}`;
  if (state.status === "stale") {
    return `Stale — last successful snapshot: ${summary}. Current pending drafts unavailable.${state.refreshing ? " Retrying…" : ""}`;
  }
  // A routine read must not churn the live region when membership is unchanged.
  // Qualifying the successful snapshot also stays honest while its replacement loads.
  return `Last successful snapshot: ${summary}`;
}
