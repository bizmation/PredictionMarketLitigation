import { useEffect, useRef, useState } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
import { surfaceHref } from "../../shared/lib/surface";
import type { DraftRecord } from "../../shared/schemas/run";
import { EmptyState, WarnChip } from "../../shared/ui";

/**
 * Story 3.10 — the operator approval queue, handoff anatomy
 * (PML Admin.html:190-355). Fetches GET /api/admin/queue with the operator's
 * Access session; J/K navigate, A/E/R act, all ignored while focus is in an
 * input or textarea. Every decision posts once to
 * POST /api/admin/drafts/:id/decision and the queue refetches.
 */

type ApprovalQueueProps = {
  /** Injected rows for tests. Omit in production — the hook fetches. */
  items?: DraftRecord[];
  /** True in local development — Evidence links go through `?surface=ops`. */
  dev?: boolean;
};

type QueueView =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "ready"; items: DraftRecord[] };

type ResolvedDecision = {
  outcome: "approved" | "edited" | "rejected";
  reason: string | null;
};

const RUN_ID = /^run-\d{8}-[0-9a-f]{4}$/;
const OUTCOMES = new Set(["approved", "edited", "rejected"]);
const EVAL_STATUSES = new Set(["ok", "eval_fail", "evals_not_run"]);

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isConfidence(value: unknown): value is number {
  return isNonNegativeInt(value) && value <= 100;
}

function isEvalSummary(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (
    typeof row.status !== "string" ||
    !EVAL_STATUSES.has(row.status) ||
    typeof row.basis !== "string"
  ) {
    return false;
  }
  const disagreement = row.disagreement;
  return (
    disagreement !== null &&
    typeof disagreement === "object" &&
    typeof (disagreement as Record<string, unknown>).flagged === "boolean"
  );
}

export function isQueueItem(value: unknown): value is DraftRecord {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.runId === "string" &&
    RUN_ID.test(row.runId) &&
    (row.targetEntityType === null ||
      typeof row.targetEntityType === "string") &&
    (row.targetEntityId === null || typeof row.targetEntityId === "string") &&
    typeof row.body === "string" &&
    row.body.length > 0 &&
    typeof row.tier2Only === "boolean" &&
    (row.confidence === null || isConfidence(row.confidence)) &&
    (row.evalSummary === null || isEvalSummary(row.evalSummary)) &&
    (row.outcome === null ||
      (typeof row.outcome === "string" && OUTCOMES.has(row.outcome))) &&
    (row.decidedAt === null || typeof row.decidedAt === "string") &&
    (row.decidedBy === null || typeof row.decidedBy === "string") &&
    (row.editedBody === null || typeof row.editedBody === "string") &&
    (row.rejectReason === null || typeof row.rejectReason === "string") &&
    typeof row.createdAt === "string" &&
    typeof row.updatedAt === "string" &&
    row.diff !== null &&
    typeof row.diff === "object" &&
    !Array.isArray(row.diff)
  );
}

function unwrapQueueItems(body: unknown): unknown[] | null {
  if (body !== null && typeof body === "object" && "items" in body) {
    const items = (body as { items: unknown }).items;
    return Array.isArray(items) ? items : null;
  }
  return null;
}

function draftTitle(draft: DraftRecord): string {
  return [
    draft.targetEntityType ?? "unspecified type",
    draft.targetEntityId ?? "unspecified target"
  ].join(" · ");
}

function diffValueText(value: unknown): string {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type DraftChange = { from: unknown; to: unknown };

function asChange(value: unknown): DraftChange | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (!("from" in row) || !("to" in row)) return null;
  return { from: row.from, to: row.to };
}

function QueueDiff({ diff }: { diff: DraftRecord["diff"] }) {
  if (diff === null || typeof diff !== "object" || Array.isArray(diff)) {
    return null;
  }
  const fields = Object.entries(diff as Record<string, unknown>);
  if (fields.length === 0) {
    return <p className="muted">No field changes proposed.</p>;
  }
  return (
    <div className="diff">
      <div className="col">
        <h4>Live now</h4>
        {fields.map(([field, raw]) => {
          const change = asChange(raw);
          return (
            <p key={field}>
              <span className="kicker">{field}</span>
              <br />
              {change?.from == null ? (
                <span className="muted">—</span>
              ) : (
                <del>{diffValueText(change.from)}</del>
              )}
            </p>
          );
        })}
      </div>
      <div className="col">
        <h4>If approved</h4>
        {fields.map(([field, raw]) => {
          const change = asChange(raw);
          return (
            <p key={field}>
              <span className="kicker">{field}</span>
              <br />
              {change?.to == null ? (
                <span className="muted">—</span>
              ) : (
                <ins>{diffValueText(change.to)}</ins>
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function FlagRow({ draft }: { draft: DraftRecord }) {
  const evalStatus = draft.evalSummary?.status;
  const evalsNotRun = evalStatus == null || evalStatus === "evals_not_run";
  const flagged = draft.evalSummary?.disagreement.flagged === true;

  return (
    <div className="flagrow">
      {draft.tier2Only ? (
        <span className="origin">Tier-2 source only</span>
      ) : null}
      {flagged ? <WarnChip>Reviewer disagreement</WarnChip> : null}
      {draft.confidence == null ? (
        <span className="muted">Confidence not recorded</span>
      ) : (
        <span className="origin">Confidence {draft.confidence}/100</span>
      )}
      {evalsNotRun ? (
        <span className="muted">Evals not run</span>
      ) : (
        <span className="origin">Evals · {evalStatus}</span>
      )}
    </div>
  );
}

const PROPOSED_TEXT_STYLE = {
  borderLeft: "2px solid var(--color-accent)",
  paddingLeft: "var(--space-4)",
  margin: 0
};

const SECTION_LABEL_STYLE = { margin: "var(--space-4) 0 var(--space-2)" };

export function ApprovalQueue({
  items: injectedItems,
  dev = false
}: ApprovalQueueProps) {
  const [view, setView] = useState<QueueView>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [editText, setEditText] = useState("");
  const [rejectText, setRejectText] = useState("");
  const [rejectPrivate, setRejectPrivate] = useState(false);
  const [resolved, setResolved] = useState<Record<string, ResolvedDecision>>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (injectedItems !== undefined) return;
    const controller = new AbortController();
    fetch("/api/admin/queue", {
      signal: controller.signal,
      credentials: "same-origin",
      headers: { accept: "application/json" }
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        const raw = unwrapQueueItems(body);
        if (raw && raw.every(isQueueItem)) {
          setView({ status: "ready", items: raw as DraftRecord[] });
          return;
        }
        setView({ status: "signedOut" });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setView({ status: "signedOut" });
      });
    return () => controller.abort();
  }, [injectedItems, reload]);

  const items = injectedItems ?? (view.status === "ready" ? view.items : null);

  async function postDecision(id: string, body: unknown) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/drafts/${id}/decision`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const record = (await res.json()) as Partial<DraftRecord>;
        const outcome =
          record.outcome === "approved" || record.outcome === "edited"
            ? record.outcome
            : "rejected";
        setResolved((prev) => ({
          ...prev,
          [id]: { outcome, reason: record.rejectReason ?? null }
        }));
        setEditing(false);
        setRejecting(false);
        setRejectText("");
        setRejectPrivate(false);
      } else if (res.status === 403) {
        setView({ status: "signedOut" });
      } else if (res.status === 409) {
        setNotice("That draft was already decided — the queue has refreshed.");
      } else {
        setNotice(
          "The decision was not recorded. The queue has refreshed; try again."
        );
      }
    } catch {
      setNotice(
        "The decision was not recorded. The queue has refreshed; try again."
      );
    } finally {
      setBusy(false);
      setReload((value) => value + 1);
    }
  }

  function approveAction() {
    if (current == null || busy) return;
    if (resolved[current.id]) return;
    if (editing) {
      if (editText.trim().length === 0) return;
      void postDecision(current.id, {
        action: "edit",
        editedBody: editText
      });
      return;
    }
    void postDecision(current.id, { action: "approve" });
  }

  function toggleEdit() {
    if (current == null || busy || resolved[current.id]) return;
    setEditing((value) => {
      if (!value) setEditText(current.body);
      return !value;
    });
    setRejecting(false);
  }

  function confirmReject() {
    if (current == null || busy || resolved[current.id]) return;
    if (rejectText.trim().length === 0) return;
    void postDecision(current.id, {
      action: "reject",
      rejectReason: rejectText,
      private: rejectPrivate
    });
  }

  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  keyHandler.current = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && /input|textarea/i.test(target.tagName)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (items === null || items.length === 0) return;
    const key = event.key.toLowerCase();
    if (key === "j") {
      setSelected((value) => (value + 1) % items.length);
      setEditing(false);
      setRejecting(false);
      setRejectText("");
      setRejectPrivate(false);
      return;
    }
    if (key === "k") {
      setSelected((value) => (value - 1 + items.length) % items.length);
      setEditing(false);
      setRejecting(false);
      setRejectText("");
      setRejectPrivate(false);
      return;
    }
    const draft = items[Math.min(selected, items.length - 1)]!;
    if (resolved[draft.id]) return;
    if (key === "a") approveAction();
    if (key === "e") toggleEdit();
    if (key === "r") {
      if (busy) return;
      setRejecting(true);
      setEditing(false);
    }
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => keyHandler.current(event);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (items === null) {
    if (view.status === "signedOut") {
      return (
        <EmptyState
          title="Operator re-authentication needed"
          hint="This queue answers only to a verified operator identity."
        >
          Your session expired or the server refused to identify you. Pass the
          Cloudflare Access challenge again and this queue reloads. Nothing here
          acted on your behalf.
        </EmptyState>
      );
    }
    return null;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing awaiting approval"
        hint="An empty queue means the pipeline proposed nothing, not that it failed."
      >
        Pending drafts appear here with their full text and proposed changes.
        Editing before approving preserves both versions, so the public diff
        shows exactly what the operator changed.
      </EmptyState>
    );
  }

  const current = items[Math.min(selected, items.length - 1)]!;

  const evidenceHref = surfaceHref("ops", {
    path: `/runs/${current.runId}`,
    dev
  });

  return (
    <div className="queue">
      <div className="panel">
        {items.map((draft, index) => {
          const decision = resolved[draft.id];
          return (
            /* oxlint-disable jsx-a11y/role-supports-aria-props -- aria-selected is the handoff's own qitem list semantics; not a menu */
            <button
              key={draft.id}
              type="button"
              className="qitem"
              aria-selected={Math.min(selected, items.length - 1) === index}
              onClick={() => {
                setSelected(index);
                setEditing(false);
                setRejecting(false);
                setRejectText("");
                setRejectPrivate(false);
              }}
            >
              <span className="qt">{draftTitle(draft)}</span>
              <span className="qm">
                run {draft.runId} · proposed {formatEtDateTime(draft.createdAt)}
              </span>
              <span className="qf">
                {decision ? (
                  <span
                    className={`run ${
                      decision.outcome === "rejected" ? "rejected" : "published"
                    }`}
                  >
                    {decision.outcome === "rejected" ? "rejected" : "published"}
                  </span>
                ) : (
                  <span className="run awaiting">Awaiting</span>
                )}
                {draft.tier2Only ? (
                  <span className="origin">Tier-2 source only</span>
                ) : null}
                {draft.confidence != null ? (
                  <span className="origin">
                    Confidence {draft.confidence}/100
                  </span>
                ) : null}
              </span>
            </button>
            /* oxlint-enable jsx-a11y/role-supports-aria-props */
          );
        })}
      </div>
      <div>
        <div className="work">
          <div className="wh">
            <span className="kicker">Draft</span>
            <span className="origin">run {current.runId}</span>
            <span className="prov agent">
              <span className="dot"></span> Drafted by agent
            </span>
            <span className="lastupd" style={{ marginLeft: "auto" }}>
              proposed {formatEtDateTime(current.createdAt)}
            </span>
          </div>
          <div className="wb">
            <h2>{draftTitle(current)}</h2>
            <div style={{ marginTop: "var(--space-3)" }}>
              <FlagRow draft={current} />
            </div>

            <div className="kicker" style={SECTION_LABEL_STYLE}>
              Proposed text{editing ? " — editing" : ""}
            </div>
            {editing ? (
              <>
                <textarea
                  className="editor"
                  aria-label="Edited draft body"
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                />
                <p className="lastupd" style={{ marginTop: "var(--space-2)" }}>
                  The original draft is preserved. Approving from here publishes
                  both versions and the diff on ops.
                </p>
              </>
            ) : (
              <p style={PROPOSED_TEXT_STYLE}>{current.body}</p>
            )}

            <div className="kicker" style={SECTION_LABEL_STYLE}>
              Effect on the tracker
            </div>
            <QueueDiff diff={current.diff} />

            <p
              className="lastupd"
              style={{ marginTop: "var(--space-4)", lineHeight: 1.6 }}
            >
              <a href={evidenceHref}>Full evidence for run {current.runId} ↗</a>
            </p>

            {rejecting && !resolved[current.id] ? (
              <div className="rejectbox">
                <label htmlFor="reject-reason">
                  Reject reason — published by default
                </label>
                <textarea
                  id="reject-reason"
                  className="editor"
                  style={{ minHeight: 84 }}
                  placeholder="Why this does not go on the record…"
                  value={rejectText}
                  onChange={(event) => setRejectText(event.target.value)}
                />
                <div className="privacy">
                  <input
                    type="checkbox"
                    id="reject-private"
                    checked={rejectPrivate}
                    onChange={(event) => setRejectPrivate(event.target.checked)}
                  />
                  <label
                    htmlFor="reject-private"
                    style={{
                      textTransform: "none",
                      letterSpacing: 0,
                      fontSize: "12.5px",
                      color: "inherit",
                      margin: 0
                    }}
                  >
                    Mark reason private — the rejection stays public, only this
                    text is withheld
                  </label>
                </div>
              </div>
            ) : null}

            {resolved[current.id] ? (
              <div className="empty" style={{ marginTop: "var(--space-4)" }}>
                <b>
                  {resolved[current.id]!.outcome === "rejected"
                    ? "Rejected"
                    : "Published"}
                </b>
                {resolved[current.id]!.outcome === "rejected"
                  ? " The tracker was not changed. The reason is now public on ops."
                  : " Promoted to the tracker with a frozen human-approved label. The evidence record is sealed."}
                <span className="hint">
                  Reversing this means a new draft and a new approval, both on
                  the record.
                </span>
              </div>
            ) : null}
          </div>
          <div className="actions">
            {resolved[current.id] ? (
              <span className="lastupd">
                Resolved. Nothing further to do on this item.
              </span>
            ) : rejecting ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={confirmReject}
                  disabled={busy || rejectText.trim().length === 0}
                >
                  Confirm rejection
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRejecting(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={approveAction}
                  disabled={busy || (editing && editText.trim().length === 0)}
                >
                  {editing ? "Approve with edits" : "Approve"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={toggleEdit}
                  disabled={busy}
                >
                  {editing ? "Discard edits" : "Edit"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setRejecting(true);
                    setEditing(false);
                  }}
                  disabled={busy}
                >
                  Reject
                </button>
                <span className="kbd">A</span>
                <span className="kbd">E</span>
                <span className="kbd">R</span>
              </>
            )}
            <span className="right">
              <span className="prov">
                <span className="dot"></span> Publishes as human-approved
              </span>
            </span>
          </div>
          {notice ? (
            <output
              className="lastupd"
              style={{ padding: "var(--space-3) var(--space-4)" }}
            >
              {notice}
            </output>
          ) : null}
        </div>
        <p
          className="lastupd"
          style={{ marginTop: "var(--space-3)", lineHeight: 1.6 }}
        >
          Nothing here is reversible quietly. A publish, an edit or a rejection
          writes to the same evidence record the public reads, under this
          operator identity.
        </p>
      </div>
    </div>
  );
}
