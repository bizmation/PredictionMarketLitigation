import * as admission from "../../shared/db/repos/runAdmissionRepo";
import { z } from "zod";
import { PollSourceSchema } from "../../shared/schemas/pipelineConfig";
import * as runPackagesRepo from "../../shared/db/repos/runPackagesRepo";
import type { Db } from "../../shared/db/client";
import { insertDraft } from "../../shared/db/repos/draftsRepo";
import {
  CONNECTOR_TIMEOUT_MS,
  DeadlineError,
  withAbortableDeadline
} from "../../shared/lib/timeouts";
import { appendStmt, scrubPayload } from "../projector/evidence";
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
  /**
   * The source was polled and the fetch still failed. `runConnector` writes
   * `source.fetched` and returns `failed: true`, so a zero-draft Run finishes
   * `failed` instead of `empty`.
   */
  failed?: boolean;
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

/** Internal storage interruption: retry collection; never commit a source outcome. */
export class SourcePersistenceError extends Error {
  constructor(cause: unknown) {
    super("source_persistence_interrupted", { cause });
    this.name = "SourcePersistenceError";
  }
}

export type SourceCheckContext = {
  signal: AbortSignal;
  beforeRequest: () => Promise<void>;
};

export type SourceCheck = (
  source: PollSource,
  context?: SourceCheckContext
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

const ObservationSchema = z.object({
  source: PollSourceSchema,
  version: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  failed: z.boolean(),
  event: z.enum(["source.fetched", "source.skipped", "run.failed"]),
  payload: z.record(z.string(), z.unknown()),
  entities: z.array(
    z.object({
      type: z.string().min(1),
      id: z.string().min(1),
      diff: z.record(z.string(), z.unknown()),
      body: z.string().min(1),
      confidence: z.number().int().min(0).max(100).optional()
    })
  )
});
type Observation = z.infer<typeof ObservationSchema>;

/** CourtListener sets this so rate-limit waits fit. Every other check stays at 60s. */
function pollTimeoutMs(check: SourceCheck): number {
  if (typeof check !== "function" || !("pollTimeoutMs" in check)) {
    return CONNECTOR_TIMEOUT_MS;
  }
  const timeout = (check as { pollTimeoutMs?: unknown }).pollTimeoutMs;
  return typeof timeout === "number" && timeout > 0
    ? timeout
    : CONNECTOR_TIMEOUT_MS;
}

async function observe(
  source: PollSource,
  check: SourceCheck,
  version: number | null,
  beforeRequest: () => Promise<void>
): Promise<Observation> {
  const createdAt = new Date().toISOString();
  const base = { source, version, createdAt };
  let items: unknown;
  try {
    items = await withAbortableDeadline(
      async (signal) => {
        const guard = async () => {
          signal.throwIfAborted();
          await beforeRequest();
          signal.throwIfAborted();
        };
        await guard();
        return check(source, { signal, beforeRequest: guard });
      },
      pollTimeoutMs(check),
      source.name
    );
  } catch (err) {
    if (err instanceof SourcePersistenceError) throw err;
    if (err instanceof DeadlineError || err instanceof SourceUnavailableError) {
      return {
        ...base,
        createdAt: new Date().toISOString(),
        entities: [],
        failed: true,
        event: "source.skipped",
        payload:
          err instanceof DeadlineError
            ? { reason: "timeout", timeoutMs: CONNECTOR_TIMEOUT_MS }
            : { ...err.detail, reason: err.reason }
      };
    }
    return {
      ...base,
      entities: [],
      failed: true,
      event: "run.failed",
      payload: { connector: source.name, reason: "error" }
    };
  }
  if (!Array.isArray(items)) {
    return {
      ...base,
      entities: [],
      failed: true,
      event: "run.failed",
      payload: { connector: source.name, reason: "error" }
    };
  }
  if (items.length === 0) {
    return {
      ...base,
      entities: [],
      failed: false,
      event: "source.skipped",
      payload: {
        reason: check === stubCheck ? "not wired" : "no material change"
      }
    };
  }
  const fetched: Record<string, unknown> = {};
  const entities: EntityChange[] = [];
  let failed = false;
  for (const item of items as SourceItem[]) {
    if (item?.fetched != null && typeof item.fetched === "object")
      Object.assign(fetched, item.fetched);
    if (Array.isArray(item?.entities)) entities.push(...item.entities);
    if (item?.failed === true) failed = true;
  }
  return {
    ...base,
    entities,
    failed,
    event: "source.fetched",
    payload: { ...fetched, itemCount: entities.length }
  };
}

/** First observation wins. A journal is NOT a completion marker. */
export async function runConnector(
  db: Db,
  runId: string,
  source: PollSource,
  check: SourceCheck
): Promise<ConnectorResult> {
  const read = () =>
    db
      .prepare(
        "SELECT observation_json, completed FROM run_source_packages WHERE run_id = ? AND source_name = ?"
      )
      .bind(runId, source.name)
      .first<{ observation_json: string; completed: number }>();
  let stored = await read();
  if (!stored) {
    const snapshot = await runPackagesRepo.readSnapshot(db, runId);
    const observation = ObservationSchema.parse(
      await observe(source, check, snapshot?.version ?? null, () =>
        admission.assertOwned(db, runId)
      )
    );
    // Scrub arbitrary connector metadata before persisting it, as with public receipts.
    observation.payload = scrubPayload(observation.payload) as Record<
      string,
      unknown
    >;
    await db.batch([
      admission.assertOwnedStmt(db, runId),
      db
        .prepare(
          "INSERT OR IGNORE INTO run_source_packages (run_id, source_name, observation_json) VALUES (?, ?, ?)"
        )
        .bind(runId, source.name, JSON.stringify(observation))
    ]);
    stored = await read();
  }
  if (!stored) throw new Error("source_observation_missing");
  const observation = ObservationSchema.parse(
    JSON.parse(stored.observation_json)
  );
  if (
    observation.source.name !== source.name ||
    observation.source.url !== source.url ||
    observation.source.tier !== source.tier
  )
    throw new Error("source_observation_identity_mismatch");
  const { entities, failed, event, createdAt, version } = observation;
  const draftCount = new Set(
    entities.map((entity) =>
      draftId(runId, source.name, entity.type, entity.id)
    )
  ).size;
  if (stored.completed === 1) return { draftCount, failed };
  await db.batch([
    admission.assertOwnedStmt(db, runId),
    appendStmt(db, {
      id: evidenceId(runId, event, source.name),
      runId,
      event,
      payload: {
        ...observation.payload,
        source: source.name,
        url: source.url,
        tier: source.tier,
        pollSourcesVersion: version,
        failed
      },
      createdAt
    })
  ]);
  for (const entity of entities) {
    // The journal makes insert-then-receipt safely repairable even after global
    // connector deduplication starts hiding this event from subsequent polls.
    await insertDraft(
      db,
      {
        id: draftId(runId, source.name, entity.type, entity.id),
        runId,
        targetEntityType: entity.type,
        targetEntityId: entity.id,
        diff: entity.diff,
        body: entity.body,
        tier2Only: source.tier === "tier2",
        confidence: entity.confidence ?? null,
        evalSummary: null,
        createdAt
      },
      admission.assertOwnedStmt(db, runId)
    );
    await db.batch([
      admission.assertOwnedStmt(db, runId),
      appendStmt(db, {
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
        createdAt
      })
    ]);
  }
  // Completion and explicit failure evidence commit together. A generic failed
  // fetched result therefore remains failed even when replay does not poll.
  const completion = db
    .prepare(
      "UPDATE run_source_packages SET completed = 1 WHERE run_id = ? AND source_name = ?"
    )
    .bind(runId, source.name);
  if (failed && event === "source.fetched") {
    await db.batch([
      admission.assertOwnedStmt(db, runId),
      appendStmt(db, {
        id: evidenceId(runId, "run.failed", source.name),
        runId,
        event: "run.failed",
        payload: {
          connector: source.name,
          url: source.url,
          tier: source.tier,
          pollSourcesVersion: version,
          reason: "source_failed"
        },
        createdAt
      }),
      completion
    ]);
  } else {
    await db.batch([admission.assertOwnedStmt(db, runId), completion]);
  }
  return { draftCount, failed };
}
