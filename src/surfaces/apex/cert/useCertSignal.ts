import { useEffect, useState } from "react";

import type { CertSignal } from "../../../shared/schemas/certSignal";

/**
 * Fetch the published cert-signal singleton. Pattern copied from
 * useOrientation / useEntityLedger: useEffect + AbortController, fail closed,
 * no query library, no React 19 use().
 *
 * Response is the object (`id: "current"`), not `{ items }`.
 * `import type` from schemas so zod does not follow into the client bundle.
 */

export type CertStatus = "idle" | "loading" | "success" | "error";

export type CertSignalState = {
  signal: CertSignal | null;
  status: CertStatus;
};

const READINGS: ReadonlySet<string> = new Set([
  "remote",
  "low",
  "elevated",
  "likely",
  "near-certain"
]);
const PROVENANCE: ReadonlySet<string> = new Set(["human", "agent"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isFactor(value: unknown): value is CertSignal["factors"][number] {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.lead === "string" &&
    row.lead.length > 0 &&
    typeof row.explanation === "string" &&
    row.explanation.length > 0
  );
}

export function isCertSignal(value: unknown): value is CertSignal {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.id !== "current") return false;
  if (typeof row.reading !== "string" || !READINGS.has(row.reading)) {
    return false;
  }
  if (!Array.isArray(row.factors) || row.factors.length === 0) return false;
  if (!row.factors.every(isFactor)) return false;
  if (typeof row.methodNote !== "string" || row.methodNote.length === 0) {
    return false;
  }
  if (typeof row.reviewedAt !== "string" || !ISO_DATE.test(row.reviewedAt)) {
    return false;
  }
  if (
    typeof row.provenanceKind !== "string" ||
    !PROVENANCE.has(row.provenanceKind)
  ) {
    return false;
  }
  return true;
}

export function useCertSignal(): CertSignalState {
  const [signal, setSignal] = useState<CertSignal | null>(null);
  const [status, setStatus] = useState<CertStatus>("idle");

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/cert-signal", {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        if (isCertSignal(body)) {
          setSignal(body);
          setStatus("success");
          return;
        }
        setSignal(null);
        setStatus("error");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSignal(null);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  return { signal, status };
}
