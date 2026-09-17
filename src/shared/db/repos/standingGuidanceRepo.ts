import type { Db } from "../client";
import {
  PublicStandingGuidanceSchema,
  STANDING_GUIDANCE_CAP,
  STANDING_GUIDANCE_MAX_CHARS,
  StandingGuidanceVersionSchema,
  type PublicStandingGuidance,
  type PublicStandingGuidanceItem,
  type StandingGuidanceVersion
} from "../../schemas/standingGuidance";

/**
 * Story 3.18 — `standing_guidance` repo. Append-only like
 * `pipelineConfigRepo`: every record / edit / revoke inserts the next
 * integer `version` for that `item_id`. There is no UPDATE or DELETE.
 * Validate-before-insert, `?` binds only. Snake_case rows in, camelCase
 * Zod-mapped domain objects out. Public ops. reads `getPublic`, never the
 * raw table, and no `steering_turns` column is projected.
 */

type GuidanceRow = {
  id: string;
  item_id: string;
  version: number;
  content: string;
  status: "active" | "revoked";
  actor_display_name: string;
  source_turn_id: string | null;
  created_at: string;
  revoked_at: string | null;
};

const COLUMNS = `id, item_id, version, content, status, actor_display_name,
                 source_turn_id, created_at, revoked_at`;

function mapRow(row: GuidanceRow): StandingGuidanceVersion | null {
  const parsed = StandingGuidanceVersionSchema.safeParse({
    id: row.id,
    itemId: row.item_id,
    version: row.version,
    content: row.content,
    status: row.status,
    actor: row.actor_display_name,
    sourceTurnId: row.source_turn_id,
    createdAt: row.created_at,
    revokedAt: row.revoked_at
  });
  return parsed.success ? parsed.data : null;
}

function mapRows(rows: GuidanceRow[] | undefined): StandingGuidanceVersion[] {
  return (rows ?? [])
    .map(mapRow)
    .filter((row): row is StandingGuidanceVersion => row != null);
}

export function guidanceItemId(newId: () => string): string {
  return `sg:${newId()}`;
}

export function guidanceRowId(itemId: string, version: number): string {
  return `${itemId}:v${version}`;
}

/**
 * Latest version per item, active only, oldest item first (by the first
 * version's created_at, then item id) so the drafter sees a stable order.
 */
export async function listInForce(db: Db): Promise<StandingGuidanceVersion[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS}
         FROM standing_guidance AS g
        WHERE g.status = 'active'
          AND g.version = (
            SELECT MAX(version) FROM standing_guidance AS l
             WHERE l.item_id = g.item_id
          )
        ORDER BY (
            SELECT MIN(created_at) FROM standing_guidance AS f
             WHERE f.item_id = g.item_id
          ) ASC,
          g.item_id ASC`
    )
    .all<GuidanceRow>();
  return mapRows(results);
}

/** Every version of every item, oldest first, then by item id and version. */
export async function listHistory(db: Db): Promise<StandingGuidanceVersion[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS}
         FROM standing_guidance
        ORDER BY created_at ASC, item_id ASC, version ASC`
    )
    .all<GuidanceRow>();
  return mapRows(results);
}

export async function getLatest(
  db: Db,
  itemId: string
): Promise<StandingGuidanceVersion | null> {
  const row = await db
    .prepare(
      `SELECT ${COLUMNS}
         FROM standing_guidance
        WHERE item_id = ?
        ORDER BY version DESC
        LIMIT 1`
    )
    .bind(itemId)
    .first<GuidanceRow>();
  return row == null ? null : mapRow(row);
}

export async function nextVersion(db: Db, itemId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(version) AS max_version
         FROM standing_guidance
        WHERE item_id = ?`
    )
    .bind(itemId)
    .first<{ max_version: number | null }>();
  return (row?.max_version ?? 0) + 1;
}

export async function countInForce(db: Db): Promise<number> {
  return (await listInForce(db)).length;
}

function toPublicItem(
  row: StandingGuidanceVersion
): PublicStandingGuidanceItem {
  return {
    itemId: row.itemId,
    version: row.version,
    status: row.status,
    content: row.content,
    actor: row.actor,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    sourceTurnId: row.sourceTurnId
  };
}

export async function getPublic(db: Db): Promise<PublicStandingGuidance> {
  const [inForce, history] = await Promise.all([
    listInForce(db),
    listHistory(db)
  ]);
  return PublicStandingGuidanceSchema.parse({
    cap: STANDING_GUIDANCE_CAP,
    maxChars: STANDING_GUIDANCE_MAX_CHARS,
    inForce: inForce.map(toPublicItem),
    history: history.map(toPublicItem)
  });
}

/**
 * Insert the next version for `itemId` (a new item when `itemId` has no
 * rows yet) with `status: active`. Content is validated against the
 * per-item length before any write. Cap enforcement is the caller's job
 * (`submitTurn`) because only a *new* item counts against it.
 */
export async function appendVersion(
  db: Db,
  input: {
    itemId: string;
    content: string;
    actor: string;
    sourceTurnId: string | null;
    createdAt: string;
  }
): Promise<StandingGuidanceVersion> {
  const version = await nextVersion(db, input.itemId);
  const record = StandingGuidanceVersionSchema.parse({
    id: guidanceRowId(input.itemId, version),
    itemId: input.itemId,
    version,
    content: input.content.trim(),
    status: "active",
    actor: input.actor.trim(),
    sourceTurnId: input.sourceTurnId,
    createdAt: input.createdAt,
    revokedAt: null
  });
  await db
    .prepare(
      `INSERT INTO standing_guidance
         (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.id,
      record.itemId,
      record.version,
      record.content,
      record.status,
      record.actor,
      record.sourceTurnId,
      record.createdAt,
      record.revokedAt
    )
    .run();
  return record;
}

/**
 * Insert a `revoked` version for an existing item. `content` is the public
 * reason. Throws when the item has no prior version — a revoke must name an
 * item that exists. `submitTurn` refuses a second revoke of an already
 * revoked item before reaching here; the repo itself only appends.
 */
export async function revoke(
  db: Db,
  input: {
    itemId: string;
    reason: string;
    actor: string;
    sourceTurnId: string | null;
    createdAt: string;
  }
): Promise<StandingGuidanceVersion> {
  const latest = await getLatest(db, input.itemId);
  if (latest == null) {
    throw new Error(`Unknown standing_guidance item ${input.itemId}`);
  }
  const version = latest.version + 1;
  const record = StandingGuidanceVersionSchema.parse({
    id: guidanceRowId(input.itemId, version),
    itemId: input.itemId,
    version,
    content: input.reason.trim(),
    status: "revoked",
    actor: input.actor.trim(),
    sourceTurnId: input.sourceTurnId,
    createdAt: input.createdAt,
    revokedAt: input.createdAt
  });
  await db
    .prepare(
      `INSERT INTO standing_guidance
         (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      record.id,
      record.itemId,
      record.version,
      record.content,
      record.status,
      record.actor,
      record.sourceTurnId,
      record.createdAt,
      record.revokedAt
    )
    .run();
  return record;
}
