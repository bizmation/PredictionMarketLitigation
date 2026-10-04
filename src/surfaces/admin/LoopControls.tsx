import { useEffect, useRef, useState } from "react";

import { etCalendarDate } from "../../shared/lib/schedule";
import { formatEtDateTime } from "../../shared/lib/dates";
import {
  ADMIN_POST_TIMEOUT_MS,
  CLIENT_GET_TIMEOUT_MS,
  fetchWithTimeout,
  isAbortError,
  isTimeoutError
} from "../../shared/lib/timeouts";
import {
  RunDispatchSchema,
  RunSummarySchema,
  type RunDispatch,
  type RunLogItem
} from "../../shared/schemas/run";
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
  | { status: "timedOut" }
  | { status: "ready"; latest: RunLogItem | null };

export const LOOP_TIMEOUT_NOTICE =
  "The latest Run status did not load within 15 seconds. Showing the last known state.";
export const RUN_TIMEOUT_NOTICE =
  "No answer within 30 seconds. The run may or may not have started — the status below refreshes.";

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

const PENDING_REQUEST_KEY = "pml.pending-run-request";
type PendingRequest = {
  requestId: string;
  scheduledFor: string;
  runId?: string;
};
function readPendingRequest(): PendingRequest | null {
  const raw = sessionStorage.getItem(PENDING_REQUEST_KEY);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object")
    throw new Error("invalid_saved_request");
  const row = value as Record<string, unknown>;
  if (
    typeof row.requestId !== "string" ||
    !row.requestId.length ||
    row.requestId.length > 128 ||
    typeof row.scheduledFor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.scheduledFor) ||
    (row.runId !== undefined &&
      (typeof row.runId !== "string" || !RUN_ID.test(row.runId)))
  )
    throw new Error("invalid_saved_request");
  return {
    requestId: row.requestId,
    scheduledFor: row.scheduledFor,
    ...(row.runId ? { runId: row.runId as string } : {})
  };
}
function savePendingRequest(request: PendingRequest) {
  sessionStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify(request));
}
function clearPendingRequest(requestId: string) {
  // Clear only this request; another mounted control may have replaced it.
  if (readPendingRequest()?.requestId === requestId)
    sessionStorage.removeItem(PENDING_REQUEST_KEY);
}

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
  const [dispatches, setDispatches] = useState<RunDispatch[]>([]);
  const pendingRequest = useRef<PendingRequest | null>(null);
  const confirmationRequest = useRef<PendingRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    try {
      const pending = readPendingRequest();
      if (pending)
        setNotice(
          `An earlier Run request for ${pending.scheduledFor} still needs checking. Run now retries that request.`
        );
    } catch {
      setNotice(
        "The saved Run request could not be read. Check existing Runs and restore browser storage before retrying."
      );
    }
  }, []);

  useEffect(() => {
    if (injected) return;
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      try {
        // One controller is shared across polls; the per-call deadline only
        // aborts its own combined signal, never this controller.
        const res = await fetchWithTimeout(
          "/api/admin/loop",
          {
            signal: controller.signal,
            credentials: "same-origin",
            headers: { accept: "application/json" }
          },
          CLIENT_GET_TIMEOUT_MS
        );
        if (cancelled) return;
        if (!res.ok) {
          setView({ status: "signedOut" });
          return;
        }
        const body: unknown = await res.json();
        if (cancelled) return;
        const latest = unwrapLatest(body);
        if (
          body &&
          typeof body === "object" &&
          "dispatches" in body &&
          Array.isArray(body.dispatches)
        )
          setDispatches(
            body.dispatches.flatMap((d) => {
              const parsed = RunDispatchSchema.safeParse(d);
              return parsed.success ? [parsed.data] : [];
            })
          );
        if (latest === undefined) {
          setView({ status: "signedOut" });
          return;
        }
        setView({ status: "ready", latest });
        // A poll that timed out earlier is no longer stale; other notices
        // (run trigger outcomes) stay until the next trigger clears them.
        setNotice((current) =>
          current === LOOP_TIMEOUT_NOTICE ? null : current
        );
      } catch (err) {
        if (cancelled) return;
        if (isAbortError(err)) return;
        if (isTimeoutError(err)) {
          // Story 3.19 — a hung GET is not a sign-out. First load: a designed
          // timed-out state with a retry. Later polls: keep the held row and
          // say so.
          if (viewRef.current.status === "ready") {
            setNotice(LOOP_TIMEOUT_NOTICE);
          } else {
            setView({ status: "timedOut" });
          }
          return;
        }
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
      // Persist before dispatch: a lost response must survive reload and midnight.
      const pending = readPendingRequest() ?? {
        requestId: crypto.randomUUID(),
        scheduledFor: etCalendarDate(new Date())
      };
      savePendingRequest(pending);
      pendingRequest.current = pending;
    } catch {
      setNotice(
        "Could not save the Run request for safe retry. No new request was sent. Check existing Runs and restore browser storage before retrying."
      );
      setBusy(false);
      return;
    }
    const pending = pendingRequest.current;
    // Once submitted, a lost response is recoverable only with this identity.
    // Cancel applies solely to a confirmation that has not been submitted.
    setConfirming(false);
    confirmationRequest.current = null;
    try {
      const res = await fetchWithTimeout(
        "/api/admin/runs",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "application/json"
          },
          body: JSON.stringify({
            origin: "manual",
            requestId: pending.requestId,
            scheduledFor: pending.scheduledFor,
            ...(supersedePriorPublish ? { supersedePriorPublish: true } : {})
          })
        },
        ADMIN_POST_TIMEOUT_MS
      );
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
        confirmationRequest.current = pending;
        setConfirming(true);
        return;
      }
      if (res.status === 409) {
        clearPendingRequest(pending.requestId);
        pendingRequest.current = null;
        setConfirming(false);
        setNotice(
          "A run is already in flight or awaiting approval for this date."
        );
        setReload((value) => value + 1);
        return;
      }
      if (!res.ok) {
        if (body && typeof body === "object" && "dispatch" in body) {
          const parsed = RunDispatchSchema.safeParse(body.dispatch);
          if (parsed.success) {
            setDispatches([parsed.data]);
            savePendingRequest({ ...pending, runId: parsed.data.runId });
            if (
              parsed.data.state === "resolved" ||
              parsed.data.state === "confirmed"
            ) {
              clearPendingRequest(pending.requestId);
              setNotice(
                `Run ${parsed.data.runId}: dispatch ${parsed.data.state}.`
              );
              setConfirming(false);
              setReload((value) => value + 1);
              return;
            }
          }
        }
        setNotice(
          "Dispatch is unresolved. Check the identified Run before starting other work."
        );
        setReload((value) => value + 1);
        return;
      }
      if (!RunSummarySchema.strip().safeParse(body).success)
        throw new Error("invalid_run_response");
      clearPendingRequest(pending.requestId);
      pendingRequest.current = null;
      setConfirming(false);
      setReload((value) => value + 1);
    } catch (err) {
      setNotice(
        isTimeoutError(err)
          ? RUN_TIMEOUT_NOTICE
          : "Dispatch outcome is unknown. Retry with the same request or check the Run below."
      );
      setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  async function recover(runId: string, action: "check" | "resolve") {
    setBusy(true);
    try {
      const res = await fetchWithTimeout(
        `/api/admin/runs/${runId}/dispatch`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action })
        },
        ADMIN_POST_TIMEOUT_MS
      );
      if (!res.ok) {
        setNotice(
          "Recovery remains unresolved. Inspect this Run's accounting and try checking again."
        );
        return;
      }
      const body = (await res.json()) as { dispatch?: unknown };
      const dispatch = RunDispatchSchema.parse(body.dispatch);
      if (dispatch.runId !== runId)
        throw new Error("dispatch_identity_mismatch");
      setDispatches((current) =>
        current.map((d) => (d.runId === runId ? dispatch : d))
      );
      if (dispatch.state === "resolved" || dispatch.state === "confirmed") {
        const pending = readPendingRequest();
        if (pending?.runId === runId) {
          clearPendingRequest(pending.requestId);
          pendingRequest.current = null;
        }
      }
      setNotice(`Run ${runId}: dispatch ${dispatch.state}.`);
      setReload((v) => v + 1);
    } catch {
      setNotice("Recovery outcome is unknown. Check this same Run again.");
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

  if (!injected && view.status === "timedOut") {
    return (
      <EmptyState
        title="Loop status did not load"
        hint="The status request timed out after 15 seconds."
      >
        <p>
          Nothing here acted on your behalf. The latest Run is still on the
          public run log; try loading these controls again.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setView({ status: "loading" });
            setReload((value) => value + 1);
          }}
        >
          Retry
        </button>
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
          <br />
          Budget accounting: {latest.spendCents} cents (includes estimates).
          Held: {latest.reservedCents ?? 0} cents; uncertain liability:{" "}
          {latest.uncertainCents ?? 0} cents; accounting issues:{" "}
          {latest.accountingIssueCount ?? 0}. Sum of rounded-up reported
          charges:{" "}
          {latest.reportedCostCents == null
            ? `unknown${latest.unmeasuredCallCount == null ? "" : ` (${latest.unmeasuredCallCount} calls without reported charges)`}`
            : `${latest.reportedCostCents} cents`}
          .
        </p>
      ) : (
        <p className="muted">No runs yet.</p>
      )}

      {notice ? <output className="muted">{notice}</output> : null}
      {dispatches.map((d) => (
        <div key={d.runId}>
          <p>
            Run {d.runId}: dispatch {d.state}
            {d.instanceStatus ? ` (${d.instanceStatus})` : ""}.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void recover(d.runId, "check")}
          >
            Check / retry {d.runId}
          </button>
          {d.canResolve && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void recover(d.runId, "resolve")}
            >
              Fence and close {d.runId}
            </button>
          )}
        </div>
      ))}

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
            onClick={() => {
              try {
                const pending = confirmationRequest.current;
                if (pending) clearPendingRequest(pending.requestId);
                confirmationRequest.current = null;
                pendingRequest.current = null;
                setConfirming(false);
              } catch {
                setNotice(
                  "Could not clear the saved request. Restore browser storage before starting another Run."
                );
              }
            }}
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
