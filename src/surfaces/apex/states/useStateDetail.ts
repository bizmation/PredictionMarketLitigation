import { useEffect, useState } from "react";

import type { StateDetail } from "../../../shared/schemas/state";

/**
 * Fetch one published state detail when a code is selected.
 * Bare JSON (`jsonOk`), fail closed, AbortController. No query library.
 */

export type DetailLoad = {
  detail: StateDetail | null;
  status: "idle" | "loading" | "success" | "error";
};

function isNamedEntity(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return typeof (value as { name?: unknown }).name === "string";
}

function isPlatformRow(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.operationalStatus === "string" &&
    isNamedEntity(row.entity)
  );
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

export function isStateDetail(value: unknown): value is StateDetail {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.code === "string" &&
    typeof row.name === "string" &&
    Array.isArray(row.platformStatuses) &&
    row.platformStatuses.every(isPlatformRow) &&
    Array.isArray(row.sources) &&
    row.sources.every(isSourceRow)
  );
}

/** Drop a previous state's payload so the panel never misattributes sources. */
export function resolveDetailLoad(
  code: string | null,
  detail: StateDetail | null,
  status: DetailLoad["status"]
): DetailLoad {
  if (code && detail && detail.code !== code) {
    return { detail: null, status: "loading" };
  }
  return { detail, status };
}

export function useStateDetail(code: string | null, epoch = 0): DetailLoad {
  const [detail, setDetail] = useState<StateDetail | null>(null);
  const [status, setStatus] = useState<DetailLoad["status"]>("idle");

  useEffect(() => {
    if (!code) {
      setDetail(null);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    setDetail(null);
    setStatus("loading");

    fetch(`/api/states/${code}`, {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error("detail"))
      )
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        if (isStateDetail(body) && body.code === code) {
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
  }, [code, epoch]);

  return resolveDetailLoad(code, detail, status);
}
