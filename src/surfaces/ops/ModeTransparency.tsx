import { useEffect, useState } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
import {
  ApprovalModeSchema,
  DEFAULT_APPROVAL_MODE,
  type ApprovalMode
} from "../../shared/schemas/mode";

/**
 * Story 3.13 — public ops. mode transparency. No login. Shows current mode,
 * integer threshold, and mode/threshold audits with displayName only.
 */

type ModeTransparencyProps = {
  current?: ApprovalMode;
};

export function ModeTransparency({ current }: ModeTransparencyProps) {
  const injected = current !== undefined;
  const [mode, setMode] = useState<ApprovalMode>(
    current ?? DEFAULT_APPROVAL_MODE
  );

  useEffect(() => {
    if (injected) {
      setMode(current);
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
        if (parsed.success) setMode(parsed.data);
      })
      .catch(() => {
        // Keep HITL default. Never imply YOLO on a public GET error.
      });
    return () => controller.abort();
  }, [injected, current]);

  const yolo = mode.mode === "yolo";

  return (
    <div className="modebox">
      <div className="mb">
        <div className="kicker">Approval gate</div>
        <div className="big">
          {yolo ? "YOLO — autonomous" : "HITL — human in the loop"}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            flexWrap: "wrap",
            marginTop: "var(--space-3)"
          }}
        >
          <span className="prov">
            <span className="dot" aria-hidden="true" />
            Autonomous mode {yolo ? "ON" : "OFF"}
          </span>
          <span className="origin">
            auto-approve threshold {mode.threshold}
          </span>
        </div>
        <p
          style={{
            fontSize: "12.5px",
            lineHeight: 1.6,
            color: "var(--color-neutral-800)",
            margin: "var(--space-3) 0 0"
          }}
        >
          {yolo
            ? "Eligible low-risk Drafts auto-approve within the published bounds. Escalations stay in the human queue."
            : "While the gate is HITL, no draft reaches the tracker without a named human clearing it. The threshold is shown even though it is inert today, so the number cannot change quietly before the mode does."}
        </p>
      </div>
      <div className="mb">
        <div className="kicker" style={{ marginBottom: "var(--space-2)" }}>
          Mode-change audit
        </div>
        {mode.audit.length === 0 ? (
          <p className="muted">No mode changes recorded.</p>
        ) : (
          <dl>
            {mode.audit.map((row) => (
              <div key={row.id} style={{ display: "contents" }}>
                <dt>{formatEtDateTime(row.createdAt)}</dt>
                <dd>
                  {row.kind === "mode"
                    ? `mode ${row.prior.mode} → ${row.next.mode}`
                    : `threshold ${row.prior.threshold} → ${row.next.threshold}`}
                  {" — "}
                  {row.actorDisplayName}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
