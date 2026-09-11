import type { Db } from "../../shared/db/client";
import { insertDraft } from "../../shared/db/repos/draftsRepo";
import { append } from "../projector/evidence";
import type { PollSource } from "./sources";

export interface EntityChange {
  type: string;
  id: string;
  diff: Record<string, { from: unknown; to: unknown }>;
  body: string;
  confidence?: number;
}

export interface SourceItem {
  entities: EntityChange[];
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
    items = await check(source);
  } catch {
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

  await append(db, {
    id: evidenceId(runId, "source.fetched", source.name),
    runId,
    event: "source.fetched",
    payload: {
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
