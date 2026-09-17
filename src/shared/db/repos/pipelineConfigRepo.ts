import type { Db } from "../client";
import { loadSeedPollSources } from "../../../pipeline/connectors/sources";
import {
  PIPELINE_CONFIG_KEY,
  PipelineConfigVersionSchema,
  PollSourcesSchema,
  PublicPipelineConfigSchema,
  type PipelineConfigVersion,
  type PollSource,
  type PublicPipelineConfig
} from "../../schemas/pipelineConfig";

/**
 * Story 3.17 — `pipeline_config_versions` repo. Validate-before-insert like
 * `steeringTurnsRepo`. Version 0 is the compile-time seed, never a D1 row.
 * Revert writes a new version whose `new_value` equals that version's
 * `new_value` (or the seed at 0); history is never deleted.
 */

type VersionRow = {
  key: string;
  version: number;
  prior_value: string;
  new_value: string;
  actor_display_name: string;
  created_at: string;
};

function parseSources(raw: string): PollSource[] | null {
  try {
    const parsed = PollSourcesSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function mapVersion(row: VersionRow): PipelineConfigVersion | null {
  const prior = parseSources(row.prior_value);
  const next = parseSources(row.new_value);
  if (prior == null || next == null) return null;
  const parsed = PipelineConfigVersionSchema.safeParse({
    key: row.key,
    version: row.version,
    prior,
    next,
    actor: row.actor_display_name,
    createdAt: row.created_at
  });
  return parsed.success ? parsed.data : null;
}

async function latestRow(db: Db): Promise<PipelineConfigVersion | null> {
  const row = await db
    .prepare(
      `SELECT key, version, prior_value, new_value, actor_display_name, created_at
         FROM pipeline_config_versions
        WHERE key = ?
        ORDER BY version DESC
        LIMIT 1`
    )
    .bind(PIPELINE_CONFIG_KEY)
    .first<VersionRow>();
  return row == null ? null : mapVersion(row);
}

export async function getEffectivePollSources(db: Db): Promise<{
  sources: PollSource[];
  version: number;
}> {
  const latest = await latestRow(db);
  if (latest == null) {
    return { sources: loadSeedPollSources(), version: 0 };
  }
  return { sources: latest.next, version: latest.version };
}

export async function listHistory(db: Db): Promise<PipelineConfigVersion[]> {
  const { results } = await db
    .prepare(
      `SELECT key, version, prior_value, new_value, actor_display_name, created_at
         FROM pipeline_config_versions
        WHERE key = ?
        ORDER BY version ASC`
    )
    .bind(PIPELINE_CONFIG_KEY)
    .all<VersionRow>();
  return (results ?? [])
    .map(mapVersion)
    .filter((row): row is PipelineConfigVersion => row != null);
}

export async function getPublic(db: Db): Promise<PublicPipelineConfig> {
  const [effective, history] = await Promise.all([
    getEffectivePollSources(db),
    listHistory(db)
  ]);
  return PublicPipelineConfigSchema.parse({
    key: PIPELINE_CONFIG_KEY,
    version: effective.version,
    sources: effective.sources,
    history: history.map((row) => ({
      version: row.version,
      key: row.key,
      prior: row.prior,
      next: row.next,
      actor: row.actor,
      createdAt: row.createdAt
    }))
  });
}

async function nextVersion(db: Db): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(version) AS max_version
         FROM pipeline_config_versions
        WHERE key = ?`
    )
    .bind(PIPELINE_CONFIG_KEY)
    .first<{ max_version: number | null }>();
  return (row?.max_version ?? 0) + 1;
}

export async function appendVersion(
  db: Db,
  input: {
    newValue: PollSource[];
    actor: string;
    createdAt: string;
  }
): Promise<PipelineConfigVersion> {
  const next = PollSourcesSchema.parse(input.newValue);
  const actor = input.actor.trim();
  if (actor.length === 0) {
    throw new Error("actor is required");
  }
  const effective = await getEffectivePollSources(db);
  const version = await nextVersion(db);
  const record = PipelineConfigVersionSchema.parse({
    key: PIPELINE_CONFIG_KEY,
    version,
    prior: effective.sources,
    next,
    actor,
    createdAt: input.createdAt
  });
  await db
    .prepare(
      `INSERT INTO pipeline_config_versions
         (key, version, prior_value, new_value, actor_display_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.key,
      record.version,
      JSON.stringify(record.prior),
      JSON.stringify(record.next),
      record.actor,
      record.createdAt
    )
    .run();
  return record;
}

export async function readVersionValue(
  db: Db,
  version: number
): Promise<PollSource[] | null> {
  if (version === 0) return loadSeedPollSources();
  const row = await db
    .prepare(
      `SELECT new_value
         FROM pipeline_config_versions
        WHERE key = ? AND version = ?`
    )
    .bind(PIPELINE_CONFIG_KEY, version)
    .first<{ new_value: string }>();
  if (row == null) return null;
  return parseSources(row.new_value);
}

export async function revertTo(
  db: Db,
  input: {
    revertToVersion: number;
    actor: string;
    createdAt: string;
  }
): Promise<PipelineConfigVersion> {
  const restored = await readVersionValue(db, input.revertToVersion);
  if (restored == null) {
    throw new Error(`Unknown poll_sources version ${input.revertToVersion}`);
  }
  return appendVersion(db, {
    newValue: restored,
    actor: input.actor,
    createdAt: input.createdAt
  });
}
