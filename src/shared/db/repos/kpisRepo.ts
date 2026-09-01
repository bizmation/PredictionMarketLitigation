import { ApexKpisSchema, type ApexKpis } from "../../schemas/kpi";
import type { Db } from "../client";

type KpiSummaryRow = {
  states_tracked: number;
  states_total: number;
  operational_go: number;
  operational_restricted: number;
  operational_banned: number;
  matters_tracked: number;
  circuits_decided: number;
  circuits_with_activity: number;
  circuits_total: number;
  appeals_pending: number;
  freshness: string | null;
  provenance_kind: string | null;
};

type CountRow = { n: number };

function asCount(value: number | null | undefined): number {
  return Number(value ?? 0);
}

/** 30 calendar days before an ISO-UTC freshness stamp, as a UTC instant. */
function windowStartUtc(freshness: string): Date {
  const start = new Date(freshness);
  start.setUTCDate(start.getUTCDate() - 30);
  return start;
}

/**
 * Docket snapshot for the apex KPI row.
 *
 * Every figure is a SQL COUNT/MAX. The 30-day window is relative to the
 * published freshness stamp, not Date.now() — the seed is a fixed snapshot
 * and wall-clock "today" would make "changed in 30 days" a lie.
 */
export async function getKpis(db: Db): Promise<ApexKpis> {
  const summary = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM states WHERE posture != 'untracked') AS states_tracked,
         (SELECT COUNT(*) FROM states) AS states_total,
         (SELECT COUNT(*) FROM states WHERE operational_status = 'go') AS operational_go,
         (SELECT COUNT(*) FROM states WHERE operational_status = 'restricted') AS operational_restricted,
         (SELECT COUNT(*) FROM states WHERE operational_status = 'banned') AS operational_banned,
         (SELECT COUNT(*) FROM cases) AS matters_tracked,
         (SELECT COUNT(*) FROM circuits
           WHERE posture IN ('platform', 'state', 'banned')) AS circuits_decided,
         (SELECT COUNT(*) FROM circuits WHERE posture != 'untracked') AS circuits_with_activity,
         (SELECT COUNT(*) FROM circuits) AS circuits_total,
         (SELECT COUNT(*) FROM cases
           WHERE forum = 'federal-appellate' AND lifecycle = 'active') AS appeals_pending,
         (SELECT MAX(updated_at) FROM (
            SELECT updated_at FROM cases
            UNION ALL SELECT updated_at FROM states
            UNION ALL SELECT updated_at FROM circuits
            UNION ALL SELECT updated_at FROM cert_signals
         )) AS freshness,
         (SELECT provenance_kind FROM cert_signals LIMIT 1) AS provenance_kind`
    )
    .first<KpiSummaryRow>();

  if (!summary?.freshness) {
    throw new Error("F1 freshness is missing — cannot derive KPI window.");
  }

  const windowStart = windowStartUtc(summary.freshness);
  const changed = await db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM states
        WHERE posture != 'untracked'
          AND updated_at >= ?`
    )
    .bind(windowStart.toISOString())
    .first<CountRow>();

  return ApexKpisSchema.parse({
    statesTracked: asCount(summary.states_tracked),
    statesTotal: asCount(summary.states_total),
    operationalGo: asCount(summary.operational_go),
    operationalRestricted: asCount(summary.operational_restricted),
    operationalBanned: asCount(summary.operational_banned),
    mattersTracked: asCount(summary.matters_tracked),
    circuitsDecided: asCount(summary.circuits_decided),
    circuitsWithActivity: asCount(summary.circuits_with_activity),
    circuitsTotal: asCount(summary.circuits_total),
    appealsPending: asCount(summary.appeals_pending),
    changedIn30Days: asCount(changed?.n),
    changedWindowStart: windowStart.toISOString().slice(0, 10),
    freshness: summary.freshness,
    provenanceKind: summary.provenance_kind ?? "human"
  });
}
