import { useEffect, useState } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
import { surfaceHref } from "../../shared/lib/surface";
import type { RunLogItem } from "../../shared/schemas/run";
import {
  EmptyState,
  OriginFlag,
  RunStatusChip,
  type RunStatus as ChipStatus
} from "../../shared/ui";

/**
 * Public ops. run log (Story 3.7). Fetches `GET /api/runs` with no login;
 * fail closed to EmptyState. Surfaces import `shared/*` only.
 */

type RunLogProps = {
  /** Injected rows for tests. Omit in production — the hook fetches. */
  items?: RunLogItem[];
  /** True in local development — Evidence links go through `?surface=ops`. */
  dev?: boolean;
};

const ORIGINS = new Set(["scheduled", "catch-up", "manual"]);
const MODES = new Set(["hitl", "yolo"]);
const STATUSES = new Set([
  "running",
  "published",
  "awaiting",
  "empty",
  "failed",
  "stopped",
  "rejected"
]);
const OUTCOMES = new Set(["approved", "edited", "rejected"]);
const RUN_ID = /^run-\d{8}-[0-9a-f]{4}$/;
const CURRENCY = /^[A-Z]{3}$/;

function isChipStatus(status: RunLogItem["status"]): status is ChipStatus {
  return status !== "running";
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isRunLogItem(value: unknown): value is RunLogItem {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    RUN_ID.test(row.id) &&
    typeof row.origin === "string" &&
    ORIGINS.has(row.origin) &&
    typeof row.mode === "string" &&
    MODES.has(row.mode) &&
    typeof row.status === "string" &&
    STATUSES.has(row.status) &&
    typeof row.startedAt === "string" &&
    (row.completedAt === null || typeof row.completedAt === "string") &&
    isNonNegativeInt(row.spendCents) &&
    typeof row.spendCurrency === "string" &&
    CURRENCY.test(row.spendCurrency) &&
    (row.budgetCents === null || isNonNegativeInt(row.budgetCents)) &&
    (row.scheduledFor === null || typeof row.scheduledFor === "string") &&
    isNonNegativeInt(row.eventCount) &&
    (row.approvalOutcome === null ||
      (typeof row.approvalOutcome === "string" &&
        OUTCOMES.has(row.approvalOutcome)))
  );
}

function unwrapItems(body: unknown): unknown[] | null {
  if (body !== null && typeof body === "object" && "items" in body) {
    const items = (body as { items: unknown }).items;
    return Array.isArray(items) ? items : null;
  }
  return null;
}

function useRunLog(): RunLogItem[] | null {
  const [items, setItems] = useState<RunLogItem[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/runs", {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        const raw = unwrapItems(body);
        if (raw && raw.every(isRunLogItem)) {
          setItems(raw);
          return;
        }
        setItems([]);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setItems([]);
      });

    return () => controller.abort();
  }, []);

  return items;
}

/** Integer cents → `$0.47`. Never a float on the wire; never a blank zero. */
export function formatUsdCents(cents: number): string {
  const dollars = Math.trunc(cents / 100);
  const remainder = cents % 100;
  return `$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

export function RunLog({ items: injectedItems, dev = false }: RunLogProps) {
  const fetched = useRunLog();
  const items = injectedItems ?? fetched;

  if (items === null) return null;

  if (items.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        hint="Empty runs are kept in this log deliberately."
      >
        Published, awaiting, empty, failed, budget-stopped and rejected runs all
        appear here, each linking to its evidence.
      </EmptyState>
    );
  }

  return (
    <table className="grid">
      <thead>
        <tr>
          <th scope="col">Run</th>
          <th scope="col">Outcome</th>
          <th scope="col">Origin</th>
          <th scope="col">Mode</th>
          <th scope="col">Steps</th>
          <th scope="col">Spend</th>
          <th scope="col">Approval</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const href = surfaceHref("ops", {
            path: `/runs/${item.id}`,
            dev
          });
          return (
            <tr key={item.id} className="runrow">
              <td>
                <a href={href} className="rid">
                  {item.id}
                </a>
                <br />
                <span className="lastupd">
                  {formatEtDateTime(item.startedAt)}
                </span>
              </td>
              <td>
                {isChipStatus(item.status) ? (
                  <RunStatusChip status={item.status} />
                ) : (
                  <span className="muted">running</span>
                )}
              </td>
              <td>
                <OriginFlag origin={item.origin} />
              </td>
              <td>{item.mode}</td>
              <td className="num">{item.eventCount}</td>
              <td className="num">{formatUsdCents(item.spendCents)}</td>
              <td>
                {item.approvalOutcome ?? <span className="muted">—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
