import type { Db } from "../../shared/db/client";
import { insertDraft } from "../../shared/db/repos/draftsRepo";
import {
  CONNECTOR_TIMEOUT_MS,
  DeadlineError,
  withDeadline
} from "../../shared/lib/timeouts";
import { append } from "../projector/evidence";
import type { PollSource } from "./sources";

/**
 * One proposed change. `diff` is `{ field: { from, to } }` for the F1
 * update targets (3.11); story 3.21's `docket_events` insert target carries
 * a verbatim record (`caseId`, `occurredAt`, `description`, …) instead, so
 * the value shape is the target's to validate at the gate.
 */
export interface EntityChange {
  type: string;
  id: string;
  diff: Record<string, unknown>;
  body: string;
  confidence?: number;
}

export interface SourceItem {
  entities: EntityChange[];
  /**
   * Story 3.21 — connector-authored summary spread into the `source.fetched`
   * payload (e.g. `docketIds`, `fetchedAt`, per-docket `latestEntryDate`).
   * An item with zero `entities` but a `fetched` summary still records
   * `source.fetched` — the source was polled and everything was seen.
   */
  fetched?: Record<string, unknown>;
}

/**
 * Story 3.21 — a connector's typed refusal. `runConnector` maps it to
 * `source.skipped { reason }` with `failed: true` beside the 3.19 deadline
 * skip, so a token-less, rate-limited, or down source is a named skip on a
 * `failed` Run — never an `empty` one and never `run.failed { "error" }`.
 */
export class SourceUnavailableError extends Error {
  readonly reason: string;
  readonly detail: Record<string, unknown>;

  constructor(reason: string, detail: Record<string, unknown> = {}) {
    super(`source unavailable: ${reason}`);
    this.name = "SourceUnavailableError";
    this.reason = reason;
    this.detail = detail;
  }
}

export type SourceCheck = (
  source: PollSource
) => Promise<SourceItem[]> | SourceItem[];

export const stubCheck: SourceCheck = () => [];

export interface ConnectorResult {
  draftCount: number;
  failed: boolean;
}

export function evidenceId(runId: string, ...parts: string[]): string {
  return ["e", runId, ...parts].join(":");
}

export function draftId(
  runId: string,
  sourceName: string,
  entityType: string,
  entityId: string
): string {
  return ["d", runId, sourceName, entityType, entityId].join(":");
}

export async function runConnector(
  db: Db,
  runId: string,
  source: PollSource,
  check: SourceCheck
): Promise<ConnectorResult> {
  const now = new Date().toISOString();
  let items: unknown;
  try {
    // Story 3.19 — one deadline per source. A hung check is a typed skip
    // (`source.skipped { reason: "timeout" }`) that still counts as a
    // failure, so a day where every source hangs is an honest `failed`
    // Run, not an `empty` one; siblings are still polled by the caller.
    items = await withDeadline(
      Promise.resolve().then(() => check(source)),
      CONNECTOR_TIMEOUT_MS,
      source.name
    );
  } catch (err) {
    if (err instanceof DeadlineError) {
      await append(db, {
        id: evidenceId(runId, "source.skipped", source.name),
        runId,
        event: "source.skipped",
        payload: {
          source: source.name,
          tier: source.tier,
          reason: "timeout",
          timeoutMs: CONNECTOR_TIMEOUT_MS
        },
        // Stamped when the deadline fired, not when the check started, so
        // the row is not 60 s early and out of order with its siblings.
        createdAt: new Date().toISOString()
      });
      return { draftCount: 0, failed: true };
    }
    if (err instanceof SourceUnavailableError) {
      await append(db, {
        id: evidenceId(runId, "source.skipped", source.name),
        runId,
        event: "source.skipped",
        // Connector detail first; the reserved keys always win.
        payload: {
          ...err.detail,
          source: source.name,
          tier: source.tier,
          reason: err.reason
        },
        createdAt: new Date().toISOString()
      });
      return { draftCount: 0, failed: true };
    }
    await append(db, {
      id: evidenceId(runId, "run.failed", source.name),
      runId,
      event: "run.failed",
      payload: { connector: source.name, tier: source.tier, reason: "error" },
      createdAt: now
    });
    return { draftCount: 0, failed: true };
  }

  if (!Array.isArray(items)) {
    await append(db, {
      id: evidenceId(runId, "run.failed", source.name),
      runId,
      event: "run.failed",
      payload: { connector: source.name, tier: source.tier, reason: "error" },
      createdAt: now
    });
    return { draftCount: 0, failed: true };
  }

  const sourceItems = items as SourceItem[];
  if (sourceItems.length === 0) {
    await append(db, {
      id: evidenceId(runId, "source.skipped", source.name),
      runId,
      event: "source.skipped",
      payload: {
        source: source.name,
        tier: source.tier,
        reason: check === stubCheck ? "not wired" : "no material change"
      },
      createdAt: now
    });
    return { draftCount: 0, failed: false };
  }

  const fetched: Record<string, unknown> = {};
  for (const item of sourceItems) {
    if (item?.fetched != null && typeof item.fetched === "object") {
      Object.assign(fetched, item.fetched);
    }
  }
  await append(db, {
    id: evidenceId(runId, "source.fetched", source.name),
    runId,
    event: "source.fetched",
    payload: {
      ...fetched,
      source: source.name,
      tier: source.tier,
      itemCount: sourceItems.length
    },
    createdAt: now
  });

  let draftCount = 0;
  for (const item of sourceItems) {
    const entities = Array.isArray(item?.entities) ? item.entities : [];
    for (const entity of entities) {
      await insertDraft(db, {
        id: draftId(runId, source.name, entity.type, entity.id),
        runId,
        targetEntityType: entity.type,
        targetEntityId: entity.id,
        diff: entity.diff,
        body: entity.body,
        tier2Only: source.tier === "tier2",
        confidence: entity.confidence ?? null,
        evalSummary: null,
        createdAt: now
      });
      await append(db, {
        id: evidenceId(
          runId,
          "draft.created",
          source.name,
          entity.type,
          entity.id
        ),
        runId,
        event: "draft.created",
        payload: {
          source: source.name,
          entityType: entity.type,
          entityId: entity.id
        },
        createdAt: now
      });
      draftCount += 1;
    }
  }
  return { draftCount, failed: false };
}
