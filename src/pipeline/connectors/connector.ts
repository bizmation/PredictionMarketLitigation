import type { Db } from "../../shared/db/client";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import { insertDraft } from "../../shared/db/repos/draftsRepo";
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

export async function runConnector(
  db: Db,
  runId: string,
  source: PollSource,
  check: SourceCheck,
  newId: () => string = () => crypto.randomUUID()
): Promise<ConnectorResult> {
  const now = new Date().toISOString();
  let items: SourceItem[];
  try {
    items = await check(source);
  } catch {
    await evidenceRepo.appendEvent(db, {
      id: newId(),
      runId,
      event: "run.failed",
      payload: { connector: source.name, tier: source.tier, reason: "error" },
      createdAt: now
    });
    return { draftCount: 0, failed: true };
  }

  if (items.length === 0) {
    await evidenceRepo.appendEvent(db, {
      id: newId(),
      runId,
      event: "source.skipped",
      payload: { source: source.name, tier: source.tier, reason: "not wired" },
      createdAt: now
    });
    return { draftCount: 0, failed: false };
  }

  await evidenceRepo.appendEvent(db, {
    id: newId(),
    runId,
    event: "source.fetched",
    payload: {
      source: source.name,
      tier: source.tier,
      itemCount: items.length
    },
    createdAt: now
  });

  let draftCount = 0;
  for (const item of items) {
    for (const entity of item.entities) {
      await insertDraft(db, {
        id: newId(),
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
      await evidenceRepo.appendEvent(db, {
        id: newId(),
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
