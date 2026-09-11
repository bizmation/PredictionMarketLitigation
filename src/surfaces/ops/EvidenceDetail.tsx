import { useEffect, useRef, useState, type ReactNode } from "react";

import { formatEtDateTime } from "../../shared/lib/dates";
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
    shouldPoll: isHeldDetail(view) && view.status === "running"
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

function stepLabel(event: EvidenceEvent): string {
  const tool = payloadField(event.payload, "tool");
  const source = payloadField(event.payload, "source");
  const extra = [source, tool].filter((part): part is string => part != null);
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

function firstDecidedBy(drafts: DraftRecord[]): string | null {
  for (const draft of drafts) {
    if (draft.decidedBy) return draft.decidedBy;
  }
  return null;
}

function ranEvals(drafts: DraftRecord[]): EvalSummary[] {
  return drafts
    .map((draft) => draft.evalSummary)
    .filter(
      (summary): summary is EvalSummary =>
        summary != null && summary.status !== "evals_not_run"
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
            Gate: HITL
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
            title="Evals not run"
            hint="An empty eval is not a passing eval."
          >
            This run predates the eval suite, or the evaluator did not run.
          </EmptyState>
        ) : (
          evals.map((summary, index) => (
            <dl className="kv" key={`eval-${index}`}>
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
          ))
        )}

        {detail.drafts.map((draft) =>
          draft.evalSummary?.disagreement.flagged ? (
            <div key={`flag-${draft.id}`}>
              <div className="kicker">Disagreement flag</div>
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
          detail.drafts.map((draft) => {
            const body = (
              <>
                <p>{draft.body}</p>
                {draft.editedBody ? (
                  <div className="diff">
                    <div className="col">
                      <h4>Agent draft</h4>
                      <p>
                        <del>{draft.body}</del>
                      </p>
                    </div>
                    <div className="col">
                      <h4>Edited</h4>
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
                <div className="kicker">Draft</div>
                {draft.outcome == null ? (
                  <NotLiveDraftBanner>{body}</NotLiveDraftBanner>
                ) : (
                  body
                )}
              </div>
            );
          })
        )}
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
    let controller = new AbortController();

    async function load() {
      controller.abort();
      controller = new AbortController();
      try {
        const res = await fetch(`/api/runs/${runId}`, {
          signal: controller.signal,
          headers: { accept: "application/json" }
        });
        if (cancelled) return;
        const body: unknown = res.ok ? await res.json() : undefined;
        if (cancelled) return;
        const mapped = mapEvidenceFetch(res.status, body, viewRef.current);
        setView(mapped.view);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        const mapped = mapEvidenceFetch(0, undefined, viewRef.current);
        setView(mapped.view);
      }
    }

    void load();
    const timer = window.setInterval(() => {
      if (mapEvidenceFetch(200, viewRef.current, viewRef.current).shouldPoll) {
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
