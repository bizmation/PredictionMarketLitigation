import { useEffect, useState } from "react";

import type { CaseDetail } from "../../../shared/schemas/caseSchema";

/**
 * Fetch one published case detail when an id is selected.
 * Bare JSON (`jsonOk`), fail closed, AbortController. No query library.
 */

export type CaseDetailLoad = {
  detail: CaseDetail | null;
  status: "idle" | "loading" | "success" | "error";
};

function isNamed(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return typeof (value as { name?: unknown }).name === "string";
}

function isSourceRow(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.url === "string" &&
    typeof row.title === "string" &&
    typeof row.tier === "string"
  );
}

function isDocketEvent(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.description === "string" &&
    typeof row.occurredAt === "string" &&
    isSourceRow(row.source)
  );
}

function isIssueTag(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.isControlling === "boolean" &&
    row.tag !== null &&
    typeof row.tag === "object" &&
    typeof (row.tag as { label?: unknown }).label === "string"
  );
}

function isAffectedState(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return isNamed(row.state);
}

export function isCaseDetail(value: unknown): value is CaseDetail {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.caption === "string" &&
    Array.isArray(row.docketEvents) &&
    row.docketEvents.every(isDocketEvent) &&
    Array.isArray(row.issueTags) &&
    row.issueTags.every(isIssueTag) &&
    Array.isArray(row.states) &&
    row.states.every(isAffectedState) &&
    Array.isArray(row.sources) &&
    row.sources.every(isSourceRow)
  );
}

/** Drop a previous case's payload so the panel never misattributes the docket. */
export function resolveCaseDetailLoad(
  id: string | null,
  detail: CaseDetail | null,
  status: CaseDetailLoad["status"]
): CaseDetailLoad {
  if (id && detail && detail.id !== id) {
    return { detail: null, status: "loading" };
  }
  return { detail, status };
}

export function useCaseDetail(id: string | null, epoch = 0): CaseDetailLoad {
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [status, setStatus] = useState<CaseDetailLoad["status"]>("idle");

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setDetail(null);
    setStatus("loading");

    fetch(`/api/cases/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("detail"))
      )
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        if (isCaseDetail(body) && body.id === id) {
          setDetail(body);
          setStatus("success");
          return;
        }
        setDetail(null);
        setStatus("error");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setDetail(null);
        setStatus("error");
      });

    return () => controller.abort();
  }, [id, epoch]);

  return resolveCaseDetailLoad(id, detail, status);
}
