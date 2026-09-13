import { useEffect, useRef, useState } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
import type { RunLogItem } from "../../shared/schemas/run";
import {
  EmptyState,
  OriginFlag,
  RunStatusChip,
  type RunStatus as ChipStatus
} from "../../shared/ui";

/**
 * Story 3.12 — operator loop controls. Live/last status is GET /api/admin/loop
 * (the same row as the public log). Run now POSTs origin `manual`. A same-date
 * published Run must confirm supersede via `.rejectbox`, not a new dialog.
 */

type LoopControlsProps = {
  /** Injected latest row for tests. `null` is "no runs"; omit to fetch. */
  latest?: RunLogItem | null;
};

type LoopView =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "ready"; latest: RunLogItem | null };

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
const POLL_MS = 4000;

function isChipStatus(status: RunLogItem["status"]): status is ChipStatus {
  return status !== "running";
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRunLogItem(value: unknown): value is RunLogItem {
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

function unwrapLatest(body: unknown): RunLogItem | null | undefined {
  if (body === null || typeof body !== "object" || !("latest" in body)) {
    return undefined;
  }
  const latest = (body as { latest: unknown }).latest;
  if (latest === null) return null;
  return isRunLogItem(latest) ? latest : undefined;
}

function errorCode(body: unknown): string | null {
  if (body === null || typeof body !== "object" || !("code" in body)) {
    return null;
  }
  const code = (body as { code: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function LoopControls({ latest: injectedLatest }: LoopControlsProps) {
  const injected = injectedLatest !== undefined;
  const [view, setView] = useState<LoopView>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (injected) return;
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/admin/loop", {
          signal: controller.signal,
          credentials: "same-origin",
          headers: { accept: "application/json" }
        });
        if (cancelled) return;
        if (!res.ok) {
          setView({ status: "signedOut" });
          return;
        }
        const body: unknown = await res.json();
        if (cancelled) return;
        const latest = unwrapLatest(body);
        if (latest === undefined) {
          setView({ status: "signedOut" });
          return;
        }
        setView({ status: "ready", latest });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setView({ status: "signedOut" });
      }
    }

    void load();
    const timer = window.setInterval(() => {
      const current = viewRef.current;
      if (
        current.status === "ready" &&
        (current.latest?.status === "running" ||
          current.latest?.status === "awaiting")
      ) {
        void load();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [injected, reload]);

  async function trigger(supersedePriorPublish: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/runs", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          origin: "manual",
          ...(supersedePriorPublish ? { supersedePriorPublish: true } : {})
        })
      });
      if (res.status === 403) {
        setView({ status: "signedOut" });
        setReload((value) => value + 1);
        return;
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (res.status === 409 && errorCode(body) === "supersede_required") {
        setConfirming(true);
        return;
      }
      if (res.status === 409) {
        setConfirming(false);
        setNotice(
          "A run is already in flight or awaiting approval for this date."
        );
        setReload((value) => value + 1);
        return;
      }
      if (!res.ok) {
        setNotice("The run was not started. Try again.");
        setReload((value) => value + 1);
        return;
      }
      setConfirming(false);
      setReload((value) => value + 1);
    } catch {
      setNotice("The run was not started. Try again.");
      setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!injected && view.status === "signedOut") {
    return (
      <EmptyState
        title="Operator re-authentication needed"
        hint="These loop controls answer only to a verified operator identity."
      >
        Your session expired or the server refused to identify you. Pass the
        Cloudflare Access challenge again and these controls reload. Nothing
        here acted on your behalf.
      </EmptyState>
    );
  }

  if (!injected && view.status === "loading") return null;

  const latest = injected
    ? injectedLatest
    : view.status === "ready"
      ? view.latest
      : null;

  return (
    <div>
      {latest ? (
        <p>
          <span className="rid">{latest.id}</span>
          {" · "}
          {isChipStatus(latest.status) ? (
            <RunStatusChip status={latest.status} />
          ) : (
            <span className="muted">running</span>
          )}{" "}
          <OriginFlag origin={latest.origin} />
          <br />
          <span className="lastupd">{formatEtDateTime(latest.startedAt)}</span>
        </p>
      ) : (
        <p className="muted">No runs yet.</p>
      )}

      {notice ? <p className="muted">{notice}</p> : null}

      {confirming ? (
        <div className="rejectbox">
          <p>
            A published Run already exists for this date. Confirming starts a
            new Run and records the supersede on Evidence.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void trigger(true)}
            disabled={busy}
          >
            Supersede prior publish
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void trigger(false)}
          disabled={busy}
        >
          Run now
        </button>
      )}
    </div>
  );
}
