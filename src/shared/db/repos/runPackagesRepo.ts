import { z } from "zod";
import type { Db } from "../client";
import { PollSourcesSchema } from "../../schemas/pipelineConfig";
import * as pipelineConfigRepo from "./pipelineConfigRepo";
import * as evidenceRepo from "./evidenceRepo";

const SnapshotSchema = z.object({
  version: z.number().int().nonnegative(),
  sources: PollSourcesSchema
});
export type SourceSnapshot = z.infer<typeof SnapshotSchema>;

export async function readSnapshot(
  db: Db,
  runId: string
): Promise<SourceSnapshot | null> {
  const row = await db
    .prepare(
      "SELECT version, sources_json FROM run_source_snapshots WHERE run_id = ?"
    )
    .bind(runId)
    .first<{ version: number; sources_json: string }>();
  return row
    ? SnapshotSchema.parse({
        version: row.version,
        sources: JSON.parse(row.sources_json)
      })
    : null;
}

export function snapshotStmt(
  db: Db,
  runId: string,
  input: SourceSnapshot
): D1PreparedStatement {
  const snapshot = SnapshotSchema.parse(input);
  return db
    .prepare(
      "INSERT OR IGNORE INTO run_source_snapshots (run_id, version, sources_json) VALUES (?, ?, ?)"
    )
    .bind(runId, snapshot.version, JSON.stringify(snapshot.sources));
}

/** Legacy attach versions only prove intent before any collection has happened. */
export async function attachSnapshot(
  db: Db,
  runId: string
): Promise<SourceSnapshot> {
  const existing = await readSnapshot(db, runId);
  if (existing) return existing;
  const evidence = await evidenceRepo.listByRun(db, runId);
  const material = await db
    .prepare("SELECT id FROM drafts WHERE run_id = ? LIMIT 1")
    .bind(runId)
    .first();
  const observed = await db
    .prepare(
      "SELECT source_name FROM run_source_packages WHERE run_id = ? LIMIT 1"
    )
    .bind(runId)
    .first();
  if (
    material ||
    observed ||
    evidence.some(
      (event) =>
        event.event.startsWith("source.") || event.event === "run.failed"
    )
  ) {
    throw new Error("historical_source_configuration_unprovable");
  }
  const started = evidence.find((event) => event.event === "run.started");
  let snapshot: SourceSnapshot;
  if (started) {
    const version = (started.payload as { pollSourcesVersion?: unknown } | null)
      ?.pollSourcesVersion;
    if (
      typeof version !== "number" ||
      !Number.isInteger(version) ||
      version <= 0
    ) {
      throw new Error("historical_source_configuration_unprovable");
    }
    const sources = await pipelineConfigRepo.readVersionValue(db, version);
    if (!sources) throw new Error("historical_source_configuration_unprovable");
    snapshot = { version, sources };
  } else {
    snapshot = await pipelineConfigRepo.getEffectivePollSources(db);
  }
  await snapshotStmt(db, runId, snapshot).run();
  return (await readSnapshot(db, runId))!;
}

export async function requireSnapshot(
  db: Db,
  runId: string
): Promise<SourceSnapshot> {
  const snapshot = await readSnapshot(db, runId);
  if (!snapshot) throw new Error("run_source_snapshot_missing");
  return snapshot;
}

/** Recover completed outcomes without polling or changing a sealed package. */
export async function hasFailure(db: Db, runId: string): Promise<boolean> {
  const failure = await db
    .prepare(`SELECT 1 FROM run_source_packages
    WHERE run_id = ? AND json_extract(observation_json, '$.failed') = 1 LIMIT 1`)
    .bind(runId)
    .first();
  return failure != null;
}
