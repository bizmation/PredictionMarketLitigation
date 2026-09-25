import { useEffect, useRef, useState } from "react";

import {
  draftReadinessLabel,
  isDraftReady
} from "../../shared/lib/draftReadiness";
import { formatEtDateTime } from "../../shared/lib/dates";
import { surfaceHref } from "../../shared/lib/surface";
import {
  ADMIN_POST_TIMEOUT_MS,
  CLIENT_GET_TIMEOUT_MS,
  fetchWithTimeout,
  isTimeoutError
} from "../../shared/lib/timeouts";
import {
  acceptableFields,
  coupledUnit,
  defaultAcceptedFields,
  InferenceSchema,
  STATE_PATCH_FIELDS,
  StatePatchSchema,
  type Inference,
  type StatePatch
} from "../../shared/schemas/docketInference";
import { AUTO_APPROVE_CONFIDENCE_THRESHOLD } from "../../shared/schemas/mode";
import type { DraftRecord } from "../../shared/schemas/run";
import { EmptyState, WarnChip } from "../../shared/ui";
import { SteeringPanel } from "./SteeringPanel";

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
  /**
   * Story 3.21 — the live YOLO threshold (0–100) from the shell's mode hook.
   * Inference fields default to Accepted iff the drafter's confidence is at
   * or above it and the reviewer did not disagree.
   */
  threshold?: number;
};

export const DOCKET_EVENTS_TARGET = "docket_events";

type QueueView =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "timedOut" }
  | { status: "ready"; items: DraftRecord[] };

export const QUEUE_TIMEOUT_NOTICE =
  "The queue did not refresh within 15 seconds. Showing the last loaded queue.";
export const DECISION_TIMEOUT_NOTICE =
  "No answer within 30 seconds. The decision may or may not have been recorded; the queue has refreshed — check before acting again.";

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
    (row.readiness === undefined ||
      row.readiness === "ready" ||
      row.readiness === "pending" ||
      row.readiness === "unavailable") &&
    (row.outcome === null ||
      (typeof row.outcome === "string" && OUTCOMES.has(row.outcome))) &&
    (row.decidedAt === null || typeof row.decidedAt === "string") &&
    (row.decidedBy === null || typeof row.decidedBy === "string") &&
    (row.editedBody === null || typeof row.editedBody === "string") &&
    (row.rejectReason === null || typeof row.rejectReason === "string") &&
    (row.parentDraftId === null || typeof row.parentDraftId === "string") &&
    isNonNegativeInt(row.revisionIndex) &&
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

type DocketView = {
  caseId: string;
  occurredAt: string;
  description: string;
  sourceUrl: string;
  entryNumber: number | null;
  caption: string | null;
  inference: Inference | null;
  statePatch: StatePatch;
  acceptable: string[];
};

/**
 * Story 3.21 — read a `docket_events` Draft's `diff`: the connector's record
 * (verbatim, read-only), the drafter's inference (if it survived the
 * vocabulary check) and the derived `statePatch`. Anything malformed renders
 * as absent rather than inventing a value.
 */
export function docketView(draft: DraftRecord): DocketView | null {
  if (draft.targetEntityType !== DOCKET_EVENTS_TARGET) return null;
  const diff = draft.diff;
  if (diff === null || typeof diff !== "object" || Array.isArray(diff)) {
    return null;
  }
  const row = diff as Record<string, unknown>;
  if (
    typeof row.caseId !== "string" ||
    typeof row.occurredAt !== "string" ||
    typeof row.description !== "string" ||
    typeof row.sourceUrl !== "string"
  ) {
    return null;
  }
  const context =
    row.context !== null &&
    typeof row.context === "object" &&
    !Array.isArray(row.context)
      ? (row.context as Record<string, unknown>)
      : null;
  const inference = InferenceSchema.safeParse(row.inference);
  const statePatch = StatePatchSchema.safeParse(row.statePatch);
  return {
    caseId: row.caseId,
    occurredAt: row.occurredAt,
    description: row.description,
    sourceUrl: row.sourceUrl,
    entryNumber: typeof row.entryNumber === "number" ? row.entryNumber : null,
    caption: typeof context?.caption === "string" ? context.caption : null,
    inference: inference.success ? inference.data : null,
    statePatch: statePatch.success ? statePatch.data : {},
    acceptable: acceptableFields(row)
  };
}

/**
 * Default per-field decision: Accept when the drafter's confidence clears
 * the live threshold and the reviewer did not disagree; otherwise Strip.
 * The operator overrides per field; nothing is published without approve.
 */
export function defaultAccepted(
  draft: DraftRecord,
  view: DocketView,
  threshold: number
): Record<string, boolean> {
  const accepted = defaultAcceptedFields(
    draft.diff,
    threshold,
    draft.evalSummary?.disagreement.flagged === true
  );
  const out: Record<string, boolean> = {};
  for (const field of view.acceptable) out[field] = accepted.includes(field);
  return out;
}

/** Toggle a field and its coupled partner together (classification / resolution units). */
export function toggleAccepted(
  current: Record<string, boolean>,
  acceptable: readonly string[],
  field: string,
  next: boolean
): Record<string, boolean> {
  const out = { ...current };
  for (const member of coupledUnit(field)) {
    if (acceptable.includes(member)) out[member] = next;
  }
  return out;
}

function fieldValueText(field: string, view: DocketView): string {
  if (field === "kind") return view.inference?.kind ?? "—";
  if (field === "favors") return view.inference?.favors ?? "—";
  const change = view.statePatch[field as (typeof STATE_PATCH_FIELDS)[number]];
  if (change == null) return "—";
  return `${diffValueText(change.from)} → ${diffValueText(change.to)}`;
}

function DocketEventCard({
  draft,
  view,
  accepted,
  onToggle
}: {
  draft: DraftRecord;
  view: DocketView;
  accepted: Record<string, boolean>;
  onToggle: (field: string, next: boolean) => void;
}) {
  const disagreement = draft.evalSummary?.disagreement;
  return (
    <div data-testid="docket-event-card">
      <div className="kicker" style={SECTION_LABEL_STYLE}>
        Record — from the docket, verbatim
      </div>
      <p style={PROPOSED_TEXT_STYLE}>
        <span className="kicker">
          {view.caption ?? view.caseId}
          {view.entryNumber != null ? ` · entry ${view.entryNumber}` : ""}
          {` · ${view.occurredAt}`}
        </span>
        <br />
        {view.description}
        <br />
        <a href={view.sourceUrl} target="_blank" rel="noopener">
          Tier-1 · CourtListener ↗
        </a>
      </p>

      <p className="lastupd">
        Edited text is a public note; the record is published verbatim.
      </p>

      <div className="kicker" style={SECTION_LABEL_STYLE}>
        Inference — the drafter's classification
      </div>
      {view.inference == null ? (
        <p className="muted">
          No inference on this record. The drafter's answer was outside the
          vocabulary and was dropped; approving publishes the record only.
        </p>
      ) : (
        <dl className="kv">
          <dt>Kind</dt>
          <dd>{view.inference.kind}</dd>
          <dt>Favors</dt>
          <dd>{view.inference.favors}</dd>
          <dt>Drafter confidence</dt>
          <dd>{Math.round(view.inference.confidence * 100)}/100</dd>
          <dt>Basis</dt>
          <dd>{view.inference.basis}</dd>
          {draft.evalSummary?.basis ? (
            <>
              <dt>Reviewer notes</dt>
              <dd>{draft.evalSummary.basis}</dd>
            </>
          ) : null}
          {disagreement?.flagged ? (
            <>
              <dt>Reviewer disagreement</dt>
              <dd>{disagreement.description}</dd>
            </>
          ) : null}
        </dl>
      )}

      {view.acceptable.length > 0 ? (
        <>
          <div className="kicker" style={SECTION_LABEL_STYLE}>
            Publish with the record — accept or strip per field
          </div>
          <ul className="steps" data-testid="accept-strip">
            {view.acceptable.map((field) => {
              const isAccepted = accepted[field] === true;
              return (
                <li key={field}>
                  <span className="kicker">{field}</span>{" "}
                  <span>{fieldValueText(field, view)}</span>{" "}
                  <span
                    className={isAccepted ? "run published" : "run rejected"}
                  >
                    {isAccepted ? "Accepted" : "Stripped"}
                  </span>{" "}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-pressed={isAccepted}
                    aria-label={`Accept ${field}`}
                    onClick={() => onToggle(field, true)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-pressed={!isAccepted}
                    aria-label={`Strip ${field}`}
                    onClick={() => onToggle(field, false)}
                  >
                    Strip
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="lastupd">
            Stripping every field publishes the record alone. Kind and favors
            travel together, as do lifecycle and decided date. Posture and
            lifecycle changes never auto-approve.
          </p>
        </>
      ) : null}
    </div>
  );
}

function FlagRow({ draft }: { draft: DraftRecord }) {
  const evalStatus = draft.evalSummary?.status;
  const evalsNotRun = evalStatus === "evals_not_run";
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
      {!isDraftReady(draft) ? (
        <span className="muted">{draftReadinessLabel(draft)}</span>
      ) : evalsNotRun ? (
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
  dev = false,
  threshold = AUTO_APPROVE_CONFIDENCE_THRESHOLD
}: ApprovalQueueProps) {
  const [view, setView] = useState<QueueView>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});
  const [rejectText, setRejectText] = useState("");
  const [rejectPrivate, setRejectPrivate] = useState(false);
  const [resolved, setResolved] = useState<Record<string, ResolvedDecision>>(
    {}
  );
  const [busy, setBusy] = useState(false);
  /**
   * 3.21 — per-field Accept/Strip override, keyed by Draft id so the next
   * Draft at the same index after a decision never inherits it.
   */
  const [accepted, setAccepted] = useState<{
    id: string;
    fields: Record<string, boolean>;
  } | null>(null);
  const [steeringBusy, setSteeringBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    if (injectedItems !== undefined) return;
    const controller = new AbortController();
    fetchWithTimeout(
      "/api/admin/queue",
      {
        signal: controller.signal,
        credentials: "same-origin",
        headers: { accept: "application/json" }
      },
      CLIENT_GET_TIMEOUT_MS
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (controller.signal.aborted) return;
        const raw = unwrapQueueItems(body);
        if (raw && raw.every(isQueueItem)) {
          setView({ status: "ready", items: raw as DraftRecord[] });
          setNotice((current) =>
            current === QUEUE_TIMEOUT_NOTICE ? null : current
          );
          return;
        }
        setView({ status: "signedOut" });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        // Story 3.19 — a hung queue GET is a designed timed-out state, not a
        // sign-out. With a queue already loaded, keep it and say so.
        if (isTimeoutError(err)) {
          if (viewRef.current.status === "ready") {
            setNotice(QUEUE_TIMEOUT_NOTICE);
          } else {
            setView({ status: "timedOut" });
          }
          return;
        }
        setView({ status: "signedOut" });
      });
    return () => controller.abort();
  }, [injectedItems, reload]);

  const items = injectedItems ?? (view.status === "ready" ? view.items : null);
  const selectedId = items?.[Math.min(selected, items.length - 1)]?.id ?? null;
  const editing = selectedId != null && editingId === selectedId;
  const editText = selectedId == null ? "" : (editTexts[selectedId] ?? "");
  function setEditing(value: boolean) {
    setEditingId(value ? selectedId : null);
  }
  function setEditText(text: string) {
    if (selectedId != null)
      setEditTexts((previous) => ({ ...previous, [selectedId]: text }));
  }

  useEffect(() => {
    if (pendingSelectId == null || items == null) return;
    const index = items.findIndex((draft) => draft.id === pendingSelectId);
    if (index < 0) return;
    setSelected(index);
    setEditingId(null);
    setRejecting(false);
    setAccepted(null);
    setPendingSelectId(null);
  }, [items, pendingSelectId]);

  async function postDecision(id: string, body: unknown) {
    if (
      !items?.some(
        (draft) =>
          draft.id === id && isDraftReady(draft) && draft.outcome == null
      )
    )
      return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetchWithTimeout(
        `/api/admin/drafts/${id}/decision`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "application/json"
          },
          body: JSON.stringify(body)
        },
        ADMIN_POST_TIMEOUT_MS
      );
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
        const error = (await res.json().catch(() => null)) as {
          code?: string;
        } | null;
        setNotice(
          error?.code === "draft_not_ready"
            ? "Evaluation is not ready for decisions. Your edits are retained; the queue has refreshed."
            : "That draft was already decided — the queue has refreshed."
        );
      } else {
        setNotice(
          "The decision was not recorded. The queue has refreshed; try again."
        );
      }
    } catch (err) {
      setNotice(
        isTimeoutError(err)
          ? DECISION_TIMEOUT_NOTICE
          : "The decision was not recorded. The queue has refreshed; try again."
      );
    } finally {
      setBusy(false);
      setReload((value) => value + 1);
    }
  }

  function approveAction() {
    if (current == null || !isDraftReady(current) || busy || steeringBusy)
      return;
    if (resolved[current.id]) return;
    // 3.21 — a docket-event Draft carries the operator's per-field override.
    const fields =
      currentView == null
        ? {}
        : {
            acceptedFields: currentView.acceptable.filter(
              (field) => currentAccepted[field] === true
            )
          };
    if (editing) {
      if (editText.trim().length === 0) return;
      void postDecision(current.id, {
        action: "edit",
        editedBody: editText,
        ...fields
      });
      return;
    }
    void postDecision(current.id, { action: "approve", ...fields });
  }

  function toggleEdit() {
    if (
      current == null ||
      !isDraftReady(current) ||
      busy ||
      steeringBusy ||
      resolved[current.id]
    )
      return;
    if (editing || editTexts[current.id] === undefined)
      setEditText(current.body);
    setEditing(!editing);
    setRejecting(false);
  }

  function confirmReject() {
    if (
      current == null ||
      !isDraftReady(current) ||
      busy ||
      steeringBusy ||
      resolved[current.id]
    )
      return;
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
      setAccepted(null);
      return;
    }
    if (key === "k") {
      setSelected((value) => (value - 1 + items.length) % items.length);
      setEditing(false);
      setRejecting(false);
      setRejectText("");
      setRejectPrivate(false);
      setAccepted(null);
      return;
    }
    const draft = items[Math.min(selected, items.length - 1)]!;
    if (resolved[draft.id] || !isDraftReady(draft)) return;
    if (key === "a") approveAction();
    if (key === "e") toggleEdit();
    if (key === "r") {
      if (busy || steeringBusy) return;
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
    if (view.status === "timedOut") {
      return (
        <EmptyState
          title="Queue did not load"
          hint="The queue request timed out after 15 seconds."
        >
          <p>
            Nothing here acted on your behalf. Pending drafts are still on the
            public ops. feed; try loading the queue again.
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
  const currentView = docketView(current);
  const currentAccepted =
    currentView == null
      ? {}
      : accepted != null && accepted.id === current.id
        ? accepted.fields
        : defaultAccepted(current, currentView, threshold);

  const evidenceHref = surfaceHref("ops", {
    path: `/runs/${current.runId}`,
    dev
  });

  return (
    <div className="queue">
      <div className="panel">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || steeringBusy}
          onClick={() => setReload((value) => value + 1)}
        >
          Refresh queue
        </button>
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
                setAccepted(null);
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
                  <span className="run awaiting">
                    {draftReadinessLabel(draft)}
                  </span>
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

            {currentView != null ? (
              <DocketEventCard
                draft={current}
                view={currentView}
                accepted={currentAccepted}
                onToggle={(field, next) =>
                  setAccepted({
                    id: current.id,
                    fields: toggleAccepted(
                      currentAccepted,
                      currentView.acceptable,
                      field,
                      next
                    )
                  })
                }
              />
            ) : (
              <>
                <div className="kicker" style={SECTION_LABEL_STYLE}>
                  Effect on the tracker
                </div>
                <QueueDiff diff={current.diff} />
              </>
            )}

            <p
              className="lastupd"
              style={{ marginTop: "var(--space-4)", lineHeight: 1.6 }}
            >
              <a href={evidenceHref}>Full evidence for run {current.runId} ↗</a>
            </p>

            <SteeringPanel
              runId={current.runId}
              draftId={current.id}
              revisionReady={isDraftReady(current)}
              onSubmittingChange={setSteeringBusy}
              onRevised={(revisedDraftId) => {
                setPendingSelectId(revisedDraftId);
                setReload((value) => value + 1);
              }}
            />

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
          {!isDraftReady(current) ? (
            <output id="draft-readiness">
              {draftReadinessLabel(current)}. Decisions and revisions are
              unavailable until completion evidence is recorded.
            </output>
          ) : null}
          <div
            className="actions"
            aria-describedby={
              !isDraftReady(current) ? "draft-readiness" : undefined
            }
          >
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
                  disabled={
                    !isDraftReady(current) ||
                    busy ||
                    steeringBusy ||
                    rejectText.trim().length === 0
                  }
                >
                  Confirm rejection
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setRejecting(false)}
                  disabled={!isDraftReady(current) || busy || steeringBusy}
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
                  disabled={
                    !isDraftReady(current) ||
                    busy ||
                    steeringBusy ||
                    (editing && editText.trim().length === 0)
                  }
                >
                  {editing ? "Approve with edits" : "Approve"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={toggleEdit}
                  disabled={!isDraftReady(current) || busy || steeringBusy}
                >
                  {editing ? "Discard edits" : "Edit"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    if (!isDraftReady(current)) return;
                    setRejecting(true);
                    setEditing(false);
                  }}
                  disabled={!isDraftReady(current) || busy || steeringBusy}
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
