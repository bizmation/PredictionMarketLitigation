import type { Development } from "../../../shared/schemas/development";
import type { ApexKpis } from "../../../shared/schemas/kpi";
import { useEffect, useState } from "react";

/**
 * Fetch the apex orientation payload. Pattern copied from useAdminSession:
 * useEffect + AbortController, fail closed, no query library, no React 19 use().
 *
 * `import type` from schemas so zod does not follow into the client bundle.
 */

export type Orientation = {
  kpis: ApexKpis | null;
  developments: Development[];
};

const KPI_NUMBERS = [
  "statesTracked",
  "statesTotal",
  "operationalGo",
  "operationalRestricted",
  "operationalBanned",
  "mattersTracked",
  "circuitsDecided",
  "circuitsWithActivity",
  "circuitsTotal",
  "appealsPending",
  "changedIn30Days"
] as const;

function isKpis(value: unknown): value is ApexKpis {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    KPI_NUMBERS.every((key) => typeof row[key] === "number") &&
    typeof row.freshness === "string" &&
    typeof row.changedWindowStart === "string"
  );
}

function isDevelopmentList(value: unknown): value is Development[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      typeof (item as Development).id === "string" &&
      typeof (item as Development).occurredAt === "string" &&
      typeof (item as Development).description === "string" &&
      typeof (item as Development).caption === "string" &&
      typeof (item as Development).court === "string" &&
      typeof (item as Development).caseId === "string"
  );
}

export function useOrientation(): Orientation {
  const [kpis, setKpis] = useState<ApexKpis | null>(null);
  const [developments, setDevelopments] = useState<Development[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const opts: RequestInit = {
      signal: controller.signal,
      headers: { accept: "application/json" }
    };

    fetch("/api/kpis", opts)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (isKpis(body)) setKpis(body);
      })
      .catch(() => {
        // Fail closed: keep empty KPIs. AbortError lands here too.
      });

    fetch("/api/developments", opts)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        const items =
          body !== null && typeof body === "object" && "items" in body
            ? (body as { items: unknown }).items
            : null;
        if (isDevelopmentList(items)) setDevelopments(items);
      })
      .catch(() => {
        // Fail closed: keep empty feed. AbortError lands here too.
      });

    return () => controller.abort();
  }, []);

  return { kpis, developments };
}
