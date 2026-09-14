import type { Db } from "../client";
import { asBool } from "../client";
import {
  SteeringTurnRecordSchema,
  type SteeringTurnRecord
} from "../../schemas/steering";

/**
 * Story 3.14 — `steering_turns` repo. Insert-only for `private`: there is
 * no UPDATE/PATCH of that flag. Snake_case rows in (via `?` binds only),
 * camelCase Zod-mapped domain objects out. `listByRun` is for the admin
 * panel; public ops. reads Evidence, never this table.
 */

type SteeringTurnRow = {
  id: string;
  run_id: string;
  draft_id: string | null;
  actor_display_name: string;
  role: "steward";
  content: string;
  private: number;
  created_at: string;
};

function mapTurn(row: SteeringTurnRow): SteeringTurnRecord {
  return SteeringTurnRecordSchema.parse({
    id: row.id,
    runId: row.run_id,
    draftId: row.draft_id,
    actorDisplayName: row.actor_display_name,
    role: row.role,
    content: row.content,
    private: asBool(row.private),
    createdAt: row.created_at
  });
}

const COLUMNS = `id, run_id, draft_id, actor_display_name, role, content,
                 private, created_at`;

export function insertStmt(
  db: Db,
  input: SteeringTurnRecord
): D1PreparedStatement {
  const turn = SteeringTurnRecordSchema.parse(input);
  return db
    .prepare(
      `INSERT INTO steering_turns (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      turn.id,
      turn.runId,
      turn.draftId,
      turn.actorDisplayName,
      turn.role,
      turn.content,
      turn.private ? 1 : 0,
      turn.createdAt
    );
}

export async function insert(
  db: Db,
  input: SteeringTurnRecord
): Promise<SteeringTurnRecord> {
  const turn = SteeringTurnRecordSchema.parse(input);
  await insertStmt(db, turn).run();
  return turn;
}

export async function listByRun(
  db: Db,
  runId: string
): Promise<SteeringTurnRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM steering_turns WHERE run_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .bind(runId)
    .all<SteeringTurnRow>();
  return (results ?? []).map(mapTurn);
}
