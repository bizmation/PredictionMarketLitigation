import { draftReadinessLabel } from "../../shared/lib/draftReadiness";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
import {
  CLIENT_GET_TIMEOUT_MS,
  fetchWithTimeout,
  isAbortError
} from "../../shared/lib/timeouts";
import { surfaceHref } from "../../shared/lib/surface";
import type {
  DraftRecord,
  EvalSummary,
  EvidenceEvent,
  RunDetail,
  RunStatus
} from "../../shared/schemas/run";
import {
  EmptyState,
  NotLiveDraftBanner,
  OriginFlag,
  ProvenanceLabel,
  RunStatusChip,
  SectionBand,
  SiteFooter,
  TopBar,
  TrustBar,
  WarnChip,
  type RunStatus as ChipStatus,
  type TopBarLink
} from "../../shared/ui";
import { useApprovalMode } from "../useApprovalMode";
import { formatUsdCents } from "./RunLog";

/**
 * Public ops. Evidence page (Story 3.8). Dedicated `/runs/:id` surface — not
 * the mock sticky aside. Fetches `GET /api/runs/:id` with no login; fail
 * closed to EmptyState. Surfaces import `shared/*` only.
 */

const REPO_URL = "https://github.com/bizmation/PredictionMarketLitigation";
const POLL_MS = 4000;
const RUN_ID = /^run-\d{8}-[0-9a-f]{4}$/;
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

type EvidenceDetailProps = {
  runId: string;
  /** True in local development — cross-surface links go through `?surface=`. */
  dev?: boolean;
  /**
   * Injected bundle for tests. Omit in production — the hook fetches.
   * `"missing"` is a 404; `"error"` is any other non-OK fetch.
   */
  detail?: RunDetail | "missing" | "error";
};

type View = RunDetail | "missing" | "error" | null;

export type EvidenceFetchMap = {
  view: RunDetail | "missing" | "error";
  shouldPoll: boolean;
};

function isChipStatus(status: RunStatus): status is ChipStatus {
  return status !== "running";
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRunDetail(value: unknown): value is RunDetail {
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
    isNonNegativeInt(row.spendCents) &&
    Array.isArray(row.drafts) &&
    Array.isArray(row.evidence) &&
    Array.isArray(row.llmCalls)
  );
}

/** Hand-rolled `/runs/:runId` — keep `resolveSurface`; no router library. */
export function runIdFromOpsPath(pathname: string): string | null {
  const match = /^\/runs\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

function isHeldDetail(view: View): view is RunDetail {
  return view !== null && typeof view === "object";
}

function shouldPollView(view: View): boolean {
  return isHeldDetail(view) && view.status === "running";
}

/**
 * GET `/api/runs/:id` → page view. 404 is missing; any other non-OK or
 * invalid body is error. A held RunDetail survives a later failed poll.
 */
export function mapEvidenceFetch(
  status: number,
  body: unknown,
  held: View = null
): EvidenceFetchMap {
  let view: RunDetail | "missing" | "error";
  if (status === 404) view = "missing";
  else if (status < 200 || status > 299) view = "error";
  else if (isRunDetail(body)) view = body;
  else view = "error";

  if ((view === "missing" || view === "error") && isHeldDetail(held)) {
    view = held;
  }

  return {
    view,
    shouldPoll: shouldPollView(view)
  };
}

/** Live `now` on the last seq while running; historical steps are `done`. */
export function evidenceStepClass(
  status: RunStatus,
  index: number,
  lastIndex: number
): "now" | "done" {
  return status === "running" && index === lastIndex ? "now" : "done";
}

function payloadField(payload: unknown, key: string): string | null {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadPrivate(payload: unknown): boolean {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return false;
  }
  return (payload as Record<string, unknown>).private === true;
}

function payloadNumber(payload: unknown, key: string): string | null {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" ? String(value) : null;
}

function payloadRefused(payload: unknown): string | null {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  return (payload as Record<string, unknown>).refused === true
    ? "refused"
    : null;
}

function payloadSourceSummary(payload: unknown, key: string): string | null {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return null;
  const names = value
    .map((item) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const name = (item as Record<string, unknown>).name;
      return typeof name === "string" && name.length > 0 ? name : null;
    })
    .filter((name): name is string => name != null);
  return names.length > 0 ? `${key} ${names.join(", ")}` : `${key} none`;
}

/**
 * Story 3.18 — `guidanceInForce` on `run.started` and `guidance` on
 * `draft.evaluated` are `{ itemId, version }` refs; summarize as a count
 * plus the ids so the public step line says what the drafter could see.
 */
function payloadGuidanceRefs(payload: unknown, key: string): string | null {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return null;
  const refs = value
    .map((item) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const ref = item as Record<string, unknown>;
      if (typeof ref.itemId !== "string" || ref.itemId.length === 0) {
        return null;
      }
      return typeof ref.version === "number"
        ? `${ref.itemId} v${ref.version}`
        : ref.itemId;
    })
    .filter((ref): ref is string => ref != null);
  const label = key === "guidanceInForce" ? "guidance in force" : key;
  return refs.length > 0
    ? `${label} ${refs.length}: ${refs.join(", ")}`
    : `${label} none`;
}

/** Story 3.21 — `acceptedFields` / `strippedFields` on `gate.decided`. */
function payloadStringList(payload: unknown, key: string): string | null {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return null;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  );
  const label = key === "docketIds" ? "dockets" : key;
  return items.length > 0 ? `${label} ${items.join(", ")}` : `${label} none`;
}

/** Story 3.21 — `inference { kind, favors }` on `draft.evaluated`. */
function payloadInference(payload: unknown): string | null {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const inference = (payload as Record<string, unknown>).inference;
  if (
    inference === null ||
    inference === undefined ||
    typeof inference !== "object" ||
    Array.isArray(inference)
  ) {
    return "inference" in (payload as Record<string, unknown>)
      ? "inference dropped"
      : null;
  }
  const row = inference as Record<string, unknown>;
  const kind = typeof row.kind === "string" ? row.kind : null;
  const favors = typeof row.favors === "string" ? row.favors : null;
  if (kind == null && favors == null) return null;
  return [
    kind == null ? null : `kind ${kind}`,
    favors == null ? null : `favors ${favors}`
  ]
    .filter((part): part is string => part != null)
    .join(" · ");
}

function stepLabel(event: EvidenceEvent): string {
  const tool = payloadField(event.payload, "tool");
  const source = payloadField(event.payload, "source");
  const priorRunId = payloadField(event.payload, "priorRunId");
  const verdict = payloadField(event.payload, "verdict");
  const draftId = payloadField(event.payload, "draftId");
  const actor = payloadField(event.payload, "actor");
  const withheld = payloadPrivate(event.payload) ? "content withheld" : null;
  const extra = [
    source,
    tool,
    priorRunId,
    verdict,
    draftId,
    payloadField(event.payload, "itemId"),
    actor,
    withheld,
    payloadField(event.payload, "content"),
    payloadField(event.payload, "reply"),
    payloadField(event.payload, "effect"),
    payloadField(event.payload, "key"),
    payloadNumber(event.payload, "version"),
    payloadRefused(event.payload),
    payloadField(event.payload, "reason"),
    payloadField(event.payload, "ruleId"),
    payloadSourceSummary(event.payload, "prior"),
    payloadSourceSummary(event.payload, "next"),
    payloadGuidanceRefs(event.payload, "guidanceInForce"),
    payloadGuidanceRefs(event.payload, "guidance"),
    payloadInference(event.payload),
    payloadStringList(event.payload, "docketIds"),
    payloadStringList(event.payload, "acceptedFields"),
    payloadStringList(event.payload, "strippedFields"),
    // 3.21 — the RECAP-lag caveat travels with the fetch it qualifies.
    payloadField(event.payload, "note")
  ].filter((part): part is string => part != null);
  return extra.length > 0
    ? `${event.event} · ${extra.join(" · ")}`
    : event.event;
}

function tokenSum(detail: RunDetail): number {
  let total = 0;
  for (const call of detail.llmCalls) {
    if (call.tokens) total += call.tokens.input + call.tokens.output;
  }
  return total;
}

function chainRootId(
  draft: DraftRecord,
  byId: Map<string, DraftRecord>
): string {
  let current = draft;
  const seen = new Set<string>();
  while (current.parentDraftId != null) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = byId.get(current.parentDraftId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

function draftsInChainOrder(drafts: DraftRecord[]): DraftRecord[] {
  const byId = new Map(drafts.map((draft) => [draft.id, draft]));
  return [...drafts].sort((a, b) => {
    const rootA = chainRootId(a, byId);
    const rootB = chainRootId(b, byId);
    if (rootA !== rootB) return rootA.localeCompare(rootB);
    if (a.revisionIndex !== b.revisionIndex) {
      return a.revisionIndex - b.revisionIndex;
    }
    return a.id.localeCompare(b.id);
  });
}

function payloadTurnId(payload: unknown): string | null {
  return payloadField(payload, "turnId");
}

function revisionInstruction(
  draft: DraftRecord,
  evidence: EvidenceEvent[]
): { effect: string; text: string | null; withheld: boolean } | null {
  if (draft.revisionIndex === 0) return null;
  const applied = evidence.find((event) => {
    if (event.event !== "steering.applied") return false;
    if (
      event.payload == null ||
      typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    ) {
      return false;
    }
    const row = event.payload as Record<string, unknown>;
    return row.effect === "revised" && row.draftId === draft.id;
  });
  const turnId = applied != null ? payloadTurnId(applied.payload) : null;
  const turn =
    turnId == null
      ? undefined
      : evidence.find(
          (event) =>
            event.event === "steering.turn" &&
            payloadTurnId(event.payload) === turnId
        );
  const withheld = turn != null && payloadPrivate(turn.payload);
  const text = withheld ? null : payloadField(turn?.payload, "content");
  return {
    effect: payloadField(applied?.payload, "effect") ?? "revised",
    text,
    withheld
  };
}

function isReadyPendingTip(draft: DraftRecord, drafts: DraftRecord[]): boolean {
  if (draft.outcome != null) return false;
  const byId = new Map(drafts.map((row) => [row.id, row]));
  const root = chainRootId(draft, byId);
  const members = drafts
    .filter((row) => chainRootId(row, byId) === root)
    .sort((a, b) => a.revisionIndex - b.revisionIndex);
  const head = members[members.length - 1];
  if (head == null || head.outcome != null) return false;
  return draft.id === head.id;
}

function decidedApprovedText(evidence: EvidenceEvent[]): string | null {
  for (let i = evidence.length - 1; i >= 0; i--) {
    const event = evidence[i]!;
    if (event.event !== "gate.decided") continue;
    const outcome = payloadField(event.payload, "outcome");
    if (outcome !== "approved" && outcome !== "edited") return null;
    return payloadField(event.payload, "approvedText");
  }
  return null;
}

function firstDecidedBy(drafts: DraftRecord[]): string | null {
  for (const draft of drafts) {
    if (draft.decidedBy) return draft.decidedBy;
  }
  return null;
}

type DocketDraftView = {
  description: string;
  occurredAt: string;
  sourceUrl: string;
  inference: {
    kind: string;
    favors: string;
    confidence: number;
    basis: string;
  } | null;
  statePatch: Array<{ field: string; from: unknown; to: unknown }>;
};

/**
 * Story 3.21 — a `docket_events` Draft carries the verbatim record, the
 * drafter's inference and the code-derived `statePatch` inside `diff`.
 * Readers see the reasoning; `gate.decided` (above) shows the override.
 */
function docketDraftView(draft: DraftRecord): DocketDraftView | null {
  if (draft.targetEntityType !== "docket_events") return null;
  const diff = draft.diff;
  if (diff == null || typeof diff !== "object" || Array.isArray(diff)) {
    return null;
  }
  const row = diff as Record<string, unknown>;
  if (
    typeof row.description !== "string" ||
    typeof row.occurredAt !== "string" ||
    typeof row.sourceUrl !== "string"
  ) {
    return null;
  }
  const inferenceRow =
    row.inference != null &&
    typeof row.inference === "object" &&
    !Array.isArray(row.inference)
      ? (row.inference as Record<string, unknown>)
      : null;
  const inference =
    inferenceRow != null &&
    typeof inferenceRow.kind === "string" &&
    typeof inferenceRow.favors === "string" &&
    typeof inferenceRow.confidence === "number" &&
    typeof inferenceRow.basis === "string"
      ? {
          kind: inferenceRow.kind,
          favors: inferenceRow.favors,
          confidence: inferenceRow.confidence,
          basis: inferenceRow.basis
        }
      : null;
  const statePatch: DocketDraftView["statePatch"] = [];
  if (
    row.statePatch != null &&
    typeof row.statePatch === "object" &&
    !Array.isArray(row.statePatch)
  ) {
    for (const [field, change] of Object.entries(
      row.statePatch as Record<string, unknown>
    )) {
      if (
        change == null ||
        typeof change !== "object" ||
        Array.isArray(change) ||
        !("to" in change)
      ) {
        continue;
      }
      const pair = change as { from?: unknown; to?: unknown };
      statePatch.push({ field, from: pair.from ?? null, to: pair.to });
    }
  }
  return {
    description: row.description,
    occurredAt: row.occurredAt,
    sourceUrl: row.sourceUrl,
    inference,
    statePatch
  };
}

function valueText(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function DocketDraftBlock({ view }: { view: DocketDraftView }) {
  return (
    <div data-testid="docket-draft">
      <div className="kicker">Record · {view.occurredAt}</div>
      <p>{view.description}</p>
      <p className="lastupd">
        <a href={view.sourceUrl} target="_blank" rel="noopener">
          Tier-1 · CourtListener ↗
        </a>
      </p>
      <div className="kicker">Inference</div>
      {view.inference == null ? (
        <p className="muted">
          No inference recorded — the drafter's answer was outside the
          vocabulary and was dropped. The record stands alone.
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
        </dl>
      )}
      <div className="kicker">Derived case state</div>
      {view.statePatch.length === 0 ? (
        <p className="muted">No case field would change.</p>
      ) : (
        <dl className="kv">
          {view.statePatch.map((change) => (
            <div key={change.field} style={{ display: "contents" }}>
              <dt>{change.field}</dt>
              <dd>
                {valueText(change.from)} → {valueText(change.to)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function ranEvals(
  drafts: DraftRecord[]
): Array<{ draftId: string; summary: EvalSummary }> {
  return drafts.flatMap((draft) =>
    draft.evalSummary != null
      ? [{ draftId: draft.id, summary: draft.evalSummary }]
      : []
  );
}

function EvidenceChrome({
  dev,
  children
}: {
  dev: boolean;
  children: ReactNode;
}) {
  const apexHref = surfaceHref("apex", { dev });
  const logHref = surfaceHref("ops", { path: "/", dev });
  const { mode } = useApprovalMode();
  const yolo = mode.mode === "yolo";
  const links: TopBarLink[] = [
    { href: logHref, label: "Run log" },
    { href: apexHref, label: "Tracker", external: true },
    { href: REPO_URL, label: "Repo", external: true }
  ];

  return (
    <div>
      <TopBar
        brand={
          <>
            ops.<em>PredictionMarketLitigation</em>
          </>
        }
        links={links}
      />
      <TrustBar
        warn={<WarnChip>Nothing here is live tracker content</WarnChip>}
        message="Runs and drafts are AI-produced and gate-controlled. Corrections welcome."
        provenance={
          <span className="prov">
            <span className="dot" aria-hidden="true" />
            Gate: {yolo ? "YOLO" : "HITL"}
          </span>
        }
      />
      <main>
        <SectionBand
          id="evidence"
          kicker="Evidence"
          title="Run evidence"
          why="Every step, dollar, eval, and draft this Run produced — including empty ones."
        >
          {children}
        </SectionBand>
      </main>
      <SiteFooter
        label="ops.PredictionMarketLitigation"
        links={[
          { href: apexHref, label: "Tracker", external: true },
          { href: REPO_URL, label: "Repo", external: true }
        ]}
        note="The litigation is the subject; the governance is the message."
      />
    </div>
  );
}

function EvidenceBody({ detail }: { detail: RunDetail }) {
  const decidedBy = firstDecidedBy(detail.drafts);
  const evals = ranEvals(detail.drafts);
  const lastIndex = detail.evidence.length - 1;
  const exportHref = `/api/runs/${detail.id}`;

  return (
    <div className="panel">
      <div className="ph">
        <span className="kicker">Evidence · run</span>
        {isChipStatus(detail.status) ? (
          <RunStatusChip status={detail.status} />
        ) : (
          <span className="muted">running</span>
        )}
      </div>
      <div className="pb">
        <h3 className="rid">{detail.id}</h3>
        <div className="lastupd">
          {formatEtDateTime(detail.startedAt)} ·{" "}
          <OriginFlag origin={detail.origin} />
        </div>

        <div className="spend">
          <div>
            <b>{formatUsdCents(detail.spendCents)}</b>
            <span>Spend</span>
          </div>
          <div>
            <b>
              {detail.budgetCents === null
                ? "Not recorded"
                : formatUsdCents(detail.budgetCents)}
            </b>
            <span>Budget ceiling</span>
          </div>
          <div>
            <b className="num">{tokenSum(detail)}</b>
            <span>Tokens</span>
          </div>
          <div>
            <b className="num">{detail.evidence.length}</b>
            <span>Steps</span>
          </div>
        </div>

        <div className="export">
          <a href={exportHref} download={`${detail.id}.json`}>
            Export JSON
          </a>
        </div>

        <div className="kicker">Steps</div>
        {detail.evidence.length === 0 ? (
          <p className="muted">No steps recorded.</p>
        ) : (
          <ul className="steps">
            {detail.evidence.map((event, index) => (
              <li
                key={event.id}
                className={evidenceStepClass(detail.status, index, lastIndex)}
              >
                <span className="sd">{formatEtDateTime(event.createdAt)}</span>
                <br />
                {stepLabel(event)}
              </li>
            ))}
          </ul>
        )}

        <div className="kicker">Provenance</div>
        <dl className="kv">
          <dt>Mode</dt>
          <dd>{detail.mode}</dd>
          <dt>Approver</dt>
          <dd>
            {decidedBy ? (
              <ProvenanceLabel
                kind={detail.mode === "yolo" ? "agent" : "human"}
                detail={decidedBy}
              />
            ) : (
              <span className="muted">none — not approved</span>
            )}
          </dd>
          <dt>Model</dt>
          <dd>
            {detail.llmCalls.length === 0 ? (
              <span className="muted">—</span>
            ) : (
              detail.llmCalls.map((call) => (
                <div key={call.id}>
                  {call.role} · {call.provider} · {call.model}
                </div>
              ))
            )}
          </dd>
          <dt>Prompt version</dt>
          <dd>not recorded</dd>
          <dt>Lineage</dt>
          <dd>sources → draft → guardrails → gate → {detail.status}</dd>
        </dl>

        <div className="kicker">Evals</div>
        {evals.length === 0 ? (
          <EmptyState
            title={
              detail.status === "running"
                ? "Evaluation in progress"
                : "Evaluation unavailable"
            }
            hint="An empty eval is not a passing eval."
          >
            No completed evaluation is recorded. Missing evidence does not mean
            evaluation passed or was explicitly skipped.
          </EmptyState>
        ) : (
          evals.map(({ draftId, summary }) => (
            <div key={`eval-${draftId}`}>
              {detail.drafts.length > 1 ? (
                <div className="kicker">{draftId}</div>
              ) : null}
              <dl className="kv">
                <dt>Status</dt>
                <dd>{summary.status}</dd>
                <dt>Basis</dt>
                <dd>{summary.basis}</dd>
                <dt>Citation completeness</dt>
                <dd>
                  {summary.citationCompleteness == null ? (
                    <span className="muted">—</span>
                  ) : (
                    summary.citationCompleteness
                  )}
                </dd>
              </dl>
            </div>
          ))
        )}

        {detail.drafts.map((draft) =>
          draft.evalSummary?.disagreement.flagged ? (
            <div key={`flag-${draft.id}`}>
              <div className="kicker">
                Disagreement flag
                {detail.drafts.length > 1 ? ` · ${draft.id}` : ""}
              </div>
              <EmptyState
                title="Flagged"
                hint="v1 records the flag and a summary. The full inter-agent explorer is phase-in."
              >
                {draft.evalSummary.disagreement.description}
              </EmptyState>
            </div>
          ) : null
        )}

        {detail.drafts.length === 0 ? (
          <EmptyState
            title="No draft produced"
            hint="Empty runs are published deliberately — absence of drama is not absence of evidence."
          >
            The run did its work and found nothing to change.
          </EmptyState>
        ) : (
          draftsInChainOrder(detail.drafts).map((draft) => {
            const instruction = revisionInstruction(draft, detail.evidence);
            const body = (
              <>
                {instruction != null ? (
                  <p className="lastupd">
                    {instruction.effect}
                    {" · "}
                    {instruction.withheld
                      ? "content withheld"
                      : (instruction.text ?? "not recorded")}
                  </p>
                ) : null}
                <p>{draft.body}</p>
                {(() => {
                  const docket = docketDraftView(draft);
                  return docket == null ? null : (
                    <DocketDraftBlock view={docket} />
                  );
                })()}
                {draft.editedBody ? (
                  <div className="diff">
                    <div className="col">
                      <h4>Agent draft</h4>
                      <p>
                        <del>{draft.body}</del>
                      </p>
                    </div>
                    <div className="col">
                      <h4>Published</h4>
                      <p>
                        <ins>{draft.editedBody}</ins>
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            );
            return (
              <div key={draft.id}>
                <div className="kicker">
                  Draft
                  {draft.revisionIndex > 0 ? ` · r${draft.revisionIndex}` : ""}
                </div>
                {draft.outcome == null ? (
                  <p>
                    {isReadyPendingTip(draft, detail.drafts)
                      ? draftReadinessLabel(draft)
                      : "Historical draft"}
                  </p>
                ) : null}
                {isReadyPendingTip(draft, detail.drafts) ? (
                  <NotLiveDraftBanner>{body}</NotLiveDraftBanner>
                ) : (
                  body
                )}
              </div>
            );
          })
        )}
        {(() => {
          const approved = decidedApprovedText(detail.evidence);
          if (approved == null) return null;
          return (
            <div>
              <div className="kicker">Approved text</div>
              <p>{approved}</p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export function EvidenceDetail({
  runId,
  dev = false,
  detail: injected
}: EvidenceDetailProps) {
  const [view, setView] = useState<View>(
    injected === undefined ? null : injected
  );
  const viewRef = useRef<View>(view);
  viewRef.current = view;

  useEffect(() => {
    if (injected !== undefined) {
      setView(injected);
      return;
    }

    let cancelled = false;
    let inFlight = false;
    const controller = new AbortController();

    async function load() {
      // Story 3.19 — never abort a live request from the poll tick: that
      // would swallow a hung GET as AbortError every 4 s and the 15 s
      // TimeoutError could never fire. One request at a time; unmount is
      // the only abort.
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetchWithTimeout(
          `/api/runs/${runId}`,
          {
            signal: controller.signal,
            headers: { accept: "application/json" }
          },
          CLIENT_GET_TIMEOUT_MS
        );
        if (cancelled) return;
        const body: unknown = res.ok ? await res.json() : undefined;
        if (cancelled) return;
        const mapped = mapEvidenceFetch(res.status, body, viewRef.current);
        setView(mapped.view);
      } catch (err) {
        if (cancelled) return;
        // Unmount abort stays silent; a TimeoutError (story 3.19) lands in
        // the same designed "Evidence unavailable" state as a network error.
        if (isAbortError(err)) return;
        const mapped = mapEvidenceFetch(0, undefined, viewRef.current);
        setView(mapped.view);
      } finally {
        inFlight = false;
      }
    }

    void load();
    const timer = window.setInterval(() => {
      if (shouldPollView(viewRef.current)) {
        void load();
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [runId, injected]);

  const resolved = injected !== undefined ? injected : view;
  if (resolved === null) {
    return <EvidenceChrome dev={dev}>{null}</EvidenceChrome>;
  }

  if (resolved === "missing" || resolved === "error") {
    return (
      <EvidenceChrome dev={dev}>
        <EmptyState
          title={
            resolved === "missing" ? "Run not found" : "Evidence unavailable"
          }
          hint="This page does not invent a Run."
        >
          {resolved === "missing"
            ? "No Evidence is published under this id."
            : "The Evidence bundle could not be loaded."}
        </EmptyState>
      </EvidenceChrome>
    );
  }

  return (
    <EvidenceChrome dev={dev}>
      <EvidenceBody detail={resolved} />
    </EvidenceChrome>
  );
}
