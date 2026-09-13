import { useEffect, useState } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
import {
  ApprovalModeSchema,
  DEFAULT_APPROVAL_MODE,
  type ApprovalMode
} from "../../shared/schemas/mode";
import { EmptyState } from "../../shared/ui";

/**
 * Story 3.13 — operator mode/threshold controls. Reads public GET /api/mode;
 * writes POST /api/admin/mode. 403 on POST is the same signed-out EmptyState
 * as LoopControls. Slider is integer 50–99 so the launch floor 70 is in range.
 */

type ModeControlsProps = {
  current?: ApprovalMode;
  onChange?: (mode: ApprovalMode) => void;
  opsHref?: string;
};

type View = { status: "ready"; mode: ApprovalMode } | { status: "signedOut" };

export function ModeControls({
  current,
  onChange,
  opsHref
}: ModeControlsProps) {
  const injected = current !== undefined;
  const [view, setView] = useState<View>({
    status: "ready",
    mode: current ?? DEFAULT_APPROVAL_MODE
  });
  const [busy, setBusy] = useState(false);
  const [localThreshold, setLocalThreshold] = useState(
    (current ?? DEFAULT_APPROVAL_MODE).threshold
  );

  useEffect(() => {
    if (injected) {
      setView({ status: "ready", mode: current });
      setLocalThreshold(current.threshold);
      return;
    }
    const controller = new AbortController();
    fetch("/api/mode", {
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        const parsed = ApprovalModeSchema.safeParse(body);
        if (!parsed.success) return;
        setView({ status: "ready", mode: parsed.data });
        setLocalThreshold(parsed.data.threshold);
      })
      .catch(() => {
        // Fail closed: keep HITL/70.
      });
    return () => controller.abort();
  }, [injected, current]);

  function confirmedThreshold(): number {
    return view.status === "ready"
      ? view.mode.threshold
      : DEFAULT_APPROVAL_MODE.threshold;
  }

  function restoreThreshold() {
    setLocalThreshold(confirmedThreshold());
  }

  function commitThreshold(next: number) {
    if (busy || next === confirmedThreshold()) return;
    void post({ threshold: next });
  }

  async function post(body: { mode?: "hitl" | "yolo"; threshold?: number }) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mode", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(body)
      });
      if (res.status === 403) {
        setView({ status: "signedOut" });
        return;
      }
      if (!res.ok) {
        restoreThreshold();
        return;
      }
      const parsed = ApprovalModeSchema.safeParse(await res.json());
      if (!parsed.success) {
        restoreThreshold();
        return;
      }
      setView({ status: "ready", mode: parsed.data });
      setLocalThreshold(parsed.data.threshold);
      onChange?.(parsed.data);
    } catch {
      restoreThreshold();
    } finally {
      setBusy(false);
    }
  }

  if (view.status === "signedOut") {
    return (
      <EmptyState
        title="Operator re-authentication needed"
        hint="Mode and threshold answer only to a verified operator identity."
      >
        Your session expired or the server refused to identify you. Pass the
        Cloudflare Access challenge again and these controls reload. Nothing
        here acted on your behalf.
      </EmptyState>
    );
  }

  const mode = view.mode;
  const yolo = mode.mode === "yolo";

  return (
    <div className="modepanel">
      <div>
        <div className="switchrow">
          <button
            type="button"
            className="toggle"
            aria-pressed={yolo}
            aria-label="Autonomous mode"
            disabled={busy}
            onClick={() => void post({ mode: yolo ? "hitl" : "yolo" })}
          >
            <i />
          </button>
          <div>
            <div className="lab">
              {yolo ? "Autonomous mode is ON" : "Autonomous mode is OFF"}
            </div>
            <div className="lastupd">
              {yolo
                ? "Eligible low-risk Drafts auto-approve within the published bounds."
                : "Every draft waits for a human. This is the default and the recommended state."}
            </div>
          </div>
        </div>
        <div className="panel" style={{ marginTop: "var(--space-4)" }}>
          <div className="ph">
            <span className="kicker">Auto-approve threshold</span>
            <span className="num" style={{ marginLeft: "auto" }}>
              {localThreshold}
            </span>
          </div>
          <div className="pb">
            <input
              type="range"
              min={50}
              max={99}
              step={1}
              value={localThreshold}
              aria-label="Auto-approve threshold"
              disabled={busy}
              style={{ width: "100%" }}
              onChange={(event) => {
                setLocalThreshold(Number(event.target.value));
              }}
              onPointerUp={(event) => {
                commitThreshold(Number(event.currentTarget.value));
              }}
              onBlur={(event) => {
                commitThreshold(Number(event.currentTarget.value));
              }}
            />
            <p
              className="lastupd"
              style={{ lineHeight: 1.6, marginTop: "var(--space-2)" }}
            >
              Inert while the gate is HITL, and shown publicly regardless — so
              the number cannot be moved quietly in advance of a mode change.
              Posture flips, party characterizations, and Tier-2-only Drafts
              never self-approve at any threshold.
            </p>
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="ph">
          <span className="kicker">Audit trail</span>
          {opsHref ? (
            <a
              href={`${opsHref}#mode`}
              style={{ marginLeft: "auto", fontSize: "11.5px" }}
            >
              Public view ↗
            </a>
          ) : null}
        </div>
        <div className="pb log">
          {mode.audit.length === 0 ? (
            <p className="muted">No mode changes recorded.</p>
          ) : (
            <ul>
              {mode.audit.map((row) => (
                <li key={row.id}>
                  {formatEtDateTime(row.createdAt)} · {row.actorDisplayName} ·{" "}
                  {row.kind === "mode"
                    ? `mode ${row.prior.mode} → ${row.next.mode}`
                    : `threshold ${row.prior.threshold} → ${row.next.threshold}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
