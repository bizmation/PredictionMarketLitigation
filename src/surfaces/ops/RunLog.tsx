import { useEffect, useState } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
import { surfaceHref } from "../../shared/lib/surface";
import {
  CLIENT_GET_TIMEOUT_MS,
  fetchWithTimeout
} from "../../shared/lib/timeouts";
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
    [
      "reservedCents",
      "uncertainCents",
      "legacyAdjustmentCents",
      "accountingIssueCount"
    ].every((key) => row[key] === undefined || isNonNegativeInt(row[key])) &&
    (row.reportedCostCents === undefined ||
      row.reportedCostCents === null ||
      isNonNegativeInt(row.reportedCostCents)) &&
    (row.unmeasuredCallCount === undefined ||
      isNonNegativeInt(row.unmeasuredCallCount)) &&
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

function useRunLog(enabled: boolean): RunLogItem[] | null {
  const [items, setItems] = useState<RunLogItem[] | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchWithTimeout(
      "/api/runs",
      {
        signal: controller.signal,
        headers: { accept: "application/json" }
      },
      CLIENT_GET_TIMEOUT_MS
    )
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
        // Unmount abort stays silent; a TimeoutError (story 3.19) lands in
        // the designed empty state like any other fetch failure.
        if (controller.signal.aborted) return;
        setItems([]);
      });

    return () => controller.abort();
  }, [enabled]);

  return items;
}

/** Integer cents → `$0.47`. Never a float on the wire; never a blank zero. */
export function formatUsdCents(cents: number): string {
  const dollars = Math.trunc(cents / 100);
  const remainder = cents % 100;
  return `$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

export function RunLog({ items: injectedItems, dev = false }: RunLogProps) {
  const fetched = useRunLog(injectedItems === undefined);
  const items = injectedItems ?? fetched;

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [sort, setSort] = useState<{
    key:
      | "startedAt"
      | "status"
      | "origin"
      | "mode"
      | "eventCount"
      | "spendCents"
      | "budgetCents"
      | "approvalOutcome";
    direction: "ascending" | "descending";
  }>({ key: "startedAt", direction: "descending" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  function sortBy(key: typeof sort.key) {
    setSort({
      key,
      direction:
        sort.key === key && sort.direction === "ascending"
          ? "descending"
          : "ascending"
    });
    setPage(0);
  }
  if (items === null) return <output>Loading Run history…</output>;

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

  const filtered = items
    .filter(
      (item) =>
        (status === "all" || item.status === status) &&
        (origin === "all" || item.origin === origin) &&
        `${item.id} ${item.scheduledFor ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())
    )
    .sort((a, b) => {
      const left = a[sort.key],
        right = b[sort.key];
      if (left == null || right == null)
        return left == null
          ? right == null
            ? a.id.localeCompare(b.id)
            : 1
          : -1;
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return comparison === 0
        ? a.id.localeCompare(b.id)
        : comparison * (sort.direction === "ascending" ? 1 : -1);
    });
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );
  const columns: [typeof sort.key, string][] = [
    ["startedAt", "Run"],
    ["status", "Outcome"],
    ["origin", "Origin"],
    ["mode", "Mode"],
    ["eventCount", "Steps"],
    ["spendCents", "Budget accounting"],
    ["budgetCents", "Budget ceiling"],
    ["approvalOutcome", "Approval"]
  ];
  return (
    <div className="run-explorer">
      <div className="overview-cards" aria-label="Run history summary">
        <div>
          <span>Recorded runs</span>
          <strong>{items.length}</strong>
          <small>All loaded history</small>
        </div>
        <div className="tone-danger">
          <span>Failed runs</span>
          <strong>
            {items.filter((item) => item.status === "failed").length}
          </strong>
          <small>Open Evidence for the cause</small>
        </div>
        <div className="tone-warning">
          <span>Awaiting approval</span>
          <strong>
            {items.filter((item) => item.status === "awaiting").length}
          </strong>
          <small>Held at the approval gate</small>
        </div>
        <div className="tone-success">
          <span>Published</span>
          <strong>
            {items.filter((item) => item.status === "published").length}
          </strong>
          <small>Completed publication</small>
        </div>
      </div>
      <div className="table-toolbar">
        <label>
          Search runs
          <input
            className="input"
            type="search"
            placeholder="Run ID or date…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          Outcome
          <select
            className="input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All outcomes</option>
            {[...STATUSES].map((value) => (
              <option key={value} value={value}>
                {value === "empty"
                  ? "No material change"
                  : value === "awaiting"
                    ? "Awaiting approval"
                    : value === "stopped"
                      ? "Budget-stopped"
                      : value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Origin
          <select
            className="input"
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value);
              setPage(0);
            }}
          >
            <option value="all">All origins</option>
            {[...ORIGINS].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setQuery("");
            setStatus("all");
            setOrigin("all");
            setPage(0);
          }}
        >
          Clear filters
        </button>
      </div>
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- keyboard users must be able to scroll the overflow table */}
      <section className="table-scroll" aria-label="Run history" tabIndex={0}>
        <table className="grid">
          <caption className="sr-only">
            Run history. Use column buttons to sort.
          </caption>
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={sort.key === key ? sort.direction : "none"}
                >
                  <button type="button" onClick={() => sortBy(key)}>
                    {label}{" "}
                    <span aria-hidden="true">
                      {sort.key === key
                        ? sort.direction === "ascending"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
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
                      <span className="run running">running</span>
                    )}
                  </td>
                  <td>
                    <OriginFlag origin={item.origin} />
                  </td>
                  <td>{item.mode}</td>
                  <td className="num">{item.eventCount}</td>
                  <td className="num">
                    <strong>{formatUsdCents(item.spendCents)}</strong>
                    <span className="cost-caption">Includes estimates</span>
                    {(item.uncertainCents ?? 0) > 0 ||
                    (item.accountingIssueCount ?? 0) > 0 ? (
                      <span className="accounting-alert">
                        Accounting needs review
                      </span>
                    ) : null}
                    <details className="cost-details">
                      <summary>Breakdown</summary>
                      <small>
                        Held {formatUsdCents(item.reservedCents ?? 0)};
                        uncertain {formatUsdCents(item.uncertainCents ?? 0)};
                        issues {item.accountingIssueCount ?? 0}
                      </small>
                      <span className="muted">
                        includes estimates; sum of rounded-up reported charges:{" "}
                        {item.reportedCostCents == null
                          ? `unknown${item.unmeasuredCallCount == null ? "" : ` (${item.unmeasuredCallCount} calls without reported charges)`}`
                          : formatUsdCents(item.reportedCostCents)}
                      </span>
                    </details>
                  </td>
                  <td className="num">
                    {item.budgetCents === null
                      ? "Not recorded"
                      : formatUsdCents(item.budgetCents)}
                  </td>
                  <td>
                    {item.approvalOutcome ?? <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <output className="filter-empty">
            No runs match these filters. Try another date or clear the filters.
          </output>
        )}
      </section>
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
      <div className="table-pagination">
        <output>
          {filtered.length === 0 ? 0 : currentPage * pageSize + 1}–
          {Math.min((currentPage + 1) * pageSize, filtered.length)} of{" "}
          {filtered.length} runs
        </output>
        <label>
          Rows per page
          <select
            className="input"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
          >
            {[10, 25, 50].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-secondary"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          Previous
        </button>
        <span>
          Page {currentPage + 1} of {pages}
        </span>
        <button
          className="btn btn-secondary"
          disabled={currentPage >= pages - 1}
          onClick={() => setPage(currentPage + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
