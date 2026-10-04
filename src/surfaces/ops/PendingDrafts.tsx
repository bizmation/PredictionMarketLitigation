import type { ReactNode } from "react";

import {
  draftReadinessLabel,
  isDraftReady
} from "../../shared/lib/draftReadiness";
import { formatEtDateTime } from "../../shared/lib/dates";
import { surfaceHref } from "../../shared/lib/surface";
import { selectPublicDrafts } from "../../shared/lib/publicDrafts";
import {
  usePublicDrafts,
  publicDraftsStatus
} from "../../shared/lib/usePublicDrafts";
export { isDraftRecord } from "../../shared/lib/publicDrafts";
import type { DraftRecord } from "../../shared/schemas/run";
import { EmptyState, NotLiveDraftBanner, WarnChip } from "../../shared/ui";

/**
 * Public ops. pending-drafts band (Story 3.9). Fetches `GET /api/drafts`
 * with no login and explicit loading/unavailable/stale states. Pending cards live inside
 * NotLiveDraftBanner; rejected Drafts are archived with their outcome.
 */

type PendingDraftsProps = {
  /** Injected rows for tests. Omit in production — the hook fetches. */
  drafts?: DraftRecord[];
  /** True in local development — Evidence links go through `?surface=ops`. */
  dev?: boolean;
};

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

function fromCell(value: unknown): ReactNode {
  return value == null ? (
    <span className="muted">—</span>
  ) : (
    <del>{diffValueText(value)}</del>
  );
}

function toCell(value: unknown): ReactNode {
  return value == null ? (
    <span className="muted">—</span>
  ) : (
    <ins>{diffValueText(value)}</ins>
  );
}

/** Real diffs are `Record<string, { from, to }>` — never the mock's prose pairs. */
function DraftDiff({ diff }: { diff: DraftRecord["diff"] }) {
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
              {fromCell(change?.from)}
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
              {toCell(change?.to)}
            </p>
          );
        })}
      </div>
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

/**
 * Story 3.21 — a `docket_events` Draft's `diff` is a verbatim record plus
 * `inference` / `statePatch`; only the derived patch is a field diff. Show
 * the classification line and the patch, not a column of dashes.
 */
function docketParts(draft: DraftRecord): {
  inference: string | null;
  statePatch: unknown;
} | null {
  if (draft.targetEntityType !== "docket_events") return null;
  const diff = draft.diff;
  if (diff === null || typeof diff !== "object" || Array.isArray(diff)) {
    return null;
  }
  const row = diff as Record<string, unknown>;
  const inference =
    row.inference !== null &&
    typeof row.inference === "object" &&
    !Array.isArray(row.inference)
      ? (row.inference as Record<string, unknown>)
      : null;
  const line =
    inference && typeof inference.kind === "string"
      ? `${inference.kind}${
          typeof inference.favors === "string"
            ? ` · favors ${inference.favors}`
            : ""
        }`
      : null;
  return { inference: line, statePatch: row.statePatch ?? {} };
}

function DraftContent({ draft, dev }: { draft: DraftRecord; dev: boolean }) {
  const evidenceHref = surfaceHref("ops", {
    path: `/runs/${draft.runId}`,
    dev
  });
  const docket = docketParts(draft);

  return (
    <>
      <p>{draft.body}</p>
      {docket != null ? (
        <>
          <div className="kicker">Classification</div>
          <p className={docket.inference == null ? "muted" : undefined}>
            {docket.inference ?? "No inference recorded — record only."}
          </p>
          <div className="kicker">Derived case state, if accepted</div>
          <DraftDiff diff={docket.statePatch} />
        </>
      ) : (
        <>
          <div className="kicker">Proposed change to the tracker</div>
          <DraftDiff diff={draft.diff} />
        </>
      )}
      <p>
        <a href={evidenceHref}>Open the evidence for this run</a>
      </p>
    </>
  );
}

function PendingCard({ draft, dev }: { draft: DraftRecord; dev: boolean }) {
  const evidenceHref = surfaceHref("ops", {
    path: `/runs/${draft.runId}`,
    dev
  });

  return (
    <NotLiveDraftBanner
      meta={
        <>
          <span>from run</span> <a href={evidenceHref}>{draft.runId}</a>
        </>
      }
    >
      <div className="draftbody">
        <h3>{draftTitle(draft)}</h3>
        <FlagRow draft={draft} />
        <DraftContent draft={draft} dev={dev} />
      </div>
    </NotLiveDraftBanner>
  );
}

function ArchiveCard({ draft, dev }: { draft: DraftRecord; dev: boolean }) {
  return (
    <div className="draft">
      <div className="draftbody">
        <h3>{draftTitle(draft)}</h3>
        <p className="muted">
          <strong>Rejected</strong> — proposed, never published
        </p>
        {draft.rejectReason ? (
          <p>
            <span className="kicker">Rejected because</span>
            <br />
            {draft.rejectReason}
          </p>
        ) : null}
        <div className="flagrow">
          <span className="origin">Rejected</span>
          {draft.decidedAt ? (
            <span className="origin">
              Decided {formatEtDateTime(draft.decidedAt)}
            </span>
          ) : null}
          {draft.decidedBy ? (
            <span className="origin">Decided by {draft.decidedBy}</span>
          ) : null}
        </div>
        <DraftContent draft={draft} dev={dev} />
      </div>
    </div>
  );
}

function emptyBand(snapshotOnly: boolean) {
  return (
    <EmptyState
      title={
        snapshotOnly
          ? "Last successful snapshot had no drafts awaiting approval"
          : "No drafts awaiting approval"
      }
      hint="Pending drafts are public here before they are published anywhere."
    >
      Each pending draft shows its full body, the changes it proposes, any
      flags, and a link into its evidence — wrapped so it can never be mistaken
      for published tracker content.
    </EmptyState>
  );
}

export function PendingDrafts({
  drafts: injectedDrafts,
  dev = false
}: PendingDraftsProps) {
  const state = usePublicDrafts(injectedDrafts);
  const { pending, rejected } = selectPublicDrafts(state.drafts ?? []);

  return (
    <div className="drafts">
      <p>
        <output aria-live="polite" aria-atomic="true">
          {publicDraftsStatus(state)}
        </output>
      </p>
      {state.status === "error" || state.status === "stale" ? (
        <button
          type="button"
          onClick={state.refresh}
          disabled={state.refreshing}
        >
          Retry pending drafts
        </button>
      ) : null}
      {state.drafts !== null && pending.length === 0
        ? emptyBand(state.status === "stale" || state.refreshing)
        : null}
      {pending.map((draft) => (
        <PendingCard key={draft.id} draft={draft} dev={dev} />
      ))}
      {rejected.length > 0 ? (
        <>
          <div className="kicker">Rejected archive</div>
          {rejected.map((draft) => (
            <ArchiveCard key={draft.id} draft={draft} dev={dev} />
          ))}
        </>
      ) : null}
    </div>
  );
}
