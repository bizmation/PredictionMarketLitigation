import { useCallback, useEffect, useRef, useState } from "react";

import type { PollResults, PollVoteBody } from "../../../shared/schemas/poll";

/**
 * Reader poll fetch + vote (Story 2.9). Pattern copied from useCertSignal:
 * useEffect + AbortController, fail closed, no query library, no React 19
 * use(). `credentials: 'same-origin'` so the HttpOnly `pml_poll` cookie
 * round-trips on the same-origin POST.
 */

export type PollStatus = "idle" | "loading" | "success" | "error";

export type PollState = {
  results: PollResults | null;
  status: PollStatus;
};

const CERTS: ReadonlySet<string> = new Set(["yes", "no"]);
const TERMS: ReadonlySet<string> = new Set(["ot26", "ot27", "ot28", "later"]);
const TERM_KEYS = ["ot26", "ot27", "ot28", "later"] as const;

function isVoteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isPollResults(value: unknown): value is PollResults {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.voted !== "boolean") return false;
  if (!isVoteCount(row.total)) return false;

  const mine = row.mine as Record<string, unknown> | null;
  if (mine === null || typeof mine !== "object") return false;
  if (mine.cert !== null && !CERTS.has(String(mine.cert))) return false;
  if (mine.term !== null && !TERMS.has(String(mine.term))) return false;

  if (row.cert !== null) {
    const cert = row.cert as Record<string, unknown>;
    if (!isVoteCount(cert.yes) || !isVoteCount(cert.no)) return false;
  }
  if (row.terms !== null) {
    const terms = row.terms as Record<string, unknown>;
    for (const key of TERM_KEYS) {
      if (!isVoteCount(terms[key])) return false;
    }
  }
  return true;
}

export function usePoll(): PollState & {
  vote: (body: PollVoteBody) => Promise<boolean>;
} {
  const [results, setResults] = useState<PollResults | null>(null);
  const [status, setStatus] = useState<PollStatus>("idle");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/poll/results", {
      signal: controller.signal,
      credentials: "same-origin",
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        if (isPollResults(body)) {
          setResults(body);
          setStatus("success");
          return;
        }
        setResults(null);
        setStatus("error");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setResults(null);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  // One POST at a time per browser tab. A double-click fires the second
  // onClick before the first response's Set-Cookie lands, so both requests
  // would arrive cookie-less and mint two voter tokens (review 2-9).
  const inFlight = useRef(false);

  const vote = useCallback(async (body: PollVoteBody): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      const res = await fetch("/api/poll/votes", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) return false;
      const data: unknown = await res.json();
      if (isPollResults(data)) {
        setResults(data);
        setStatus("success");
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      inFlight.current = false;
    }
  }, []);

  return { results, status, vote };
}
