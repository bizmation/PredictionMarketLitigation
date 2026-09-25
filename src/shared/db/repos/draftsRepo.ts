import { assertStmt } from "./gateAssertions";
import { z } from "zod";
import { deriveDraftReadiness, isDraftReady } from "../../lib/draftReadiness";
export { isDraftReady } from "../../lib/draftReadiness";

import { IsoUtcSchema } from "../../schemas/common";
import {
  DRAFT_OUTCOME_VALUES,
  DraftRecordSchema,
  EvalSummarySchema,
  type DraftRecord,
  type EvalSummary
} from "../../schemas/run";
import { asBool, type Db } from "../client";

/**
 * Story 3.1 — `drafts` repo. Snake_case rows in (via `?` binds only),
 * camelCase Zod-mapped domain objects out. `insertDraft` uses
 * `INSERT OR IGNORE` so a Workflow `step.do` retry with a deterministic
 * draft id does not throw or duplicate the row. Story 3.5 adds
 * `applyDraftReview` (validate-before-UPDATE) for the drafter overwrite + eval.
 */

type DraftRow = {
  id: string;
  run_status: string | null;
  evaluated: number;
  guardrails: number;
  revised: number;
  run_id: string;
  target_entity_type: string | null;
  target_entity_id: string | null;
  diff_json: string;
  body: string;
  tier2_only: number;
  confidence: number | null;
  eval_summary_json: string | null;
  outcome: string | null;
  decided_at: string | null;
  decided_by: string | null;
  edited_body: string | null;
  reject_reason: string | null;
  reject_reason_private: string | null;
  parent_draft_id: string | null;
  revision_index: number;
  created_at: string;
  updated_at: string;
};

const DRAFT_COLUMNS = `id, run_id, target_entity_type, target_entity_id, diff_json,
              body, tier2_only, confidence, eval_summary_json, outcome,
              decided_at, decided_by, edited_body, reject_reason,
              parent_draft_id, revision_index, created_at, updated_at,
              (SELECT status FROM runs WHERE runs.id = drafts.run_id) AS run_status,
              EXISTS (SELECT 1 FROM evidence_events e WHERE e.run_id = drafts.run_id
                AND e.event = 'draft.evaluated' AND json_extract(e.payload_json, '$.draftId') = drafts.id) AS evaluated,
              EXISTS (SELECT 1 FROM evidence_events e WHERE e.run_id = drafts.run_id
                AND e.event IN ('guardrails.passed', 'guardrails.failed') AND json_extract(e.payload_json, '$.draftId') = drafts.id) AS guardrails,
              EXISTS (SELECT 1 FROM evidence_events e WHERE e.run_id = drafts.run_id
                AND e.event = 'draft.revised' AND json_extract(e.payload_json, '$.draftId') = drafts.id) AS revised`;

const storedSnapshots = new WeakMap<
  DraftRecord,
  { diff: string; evaluation: string | null }
>();

function mapDraft(row: DraftRow): DraftRecord {
  const record = DraftRecordSchema.parse({
    id: row.id,
    runId: row.run_id,
    targetEntityType: row.target_entity_type,
    targetEntityId: row.target_entity_id,
    diff: JSON.parse(row.diff_json),
    body: row.body,
    tier2Only: asBool(row.tier2_only),
    confidence: row.confidence,
    evalSummary:
      row.eval_summary_json == null ? null : JSON.parse(row.eval_summary_json),
    readiness: deriveDraftReadiness({
      summary:
        row.eval_summary_json == null
          ? null
          : JSON.parse(row.eval_summary_json),
      revisionIndex: row.revision_index,
      runStatus: row.run_status,
      evaluated: row.evaluated === 1,
      guardrails: row.guardrails === 1,
      revised: row.revised === 1
    }),
    outcome: row.outcome,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    editedBody: row.edited_body,
    rejectReason: row.reject_reason,
    parentDraftId: row.parent_draft_id,
    revisionIndex: row.revision_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
  storedSnapshots.set(record, {
    diff: row.diff_json,
    evaluation: row.eval_summary_json
  });
  return record;
}

export function revisionDraftId(
  parentId: string,
  revisionIndex: number
): string {
  return `${parentId}:r${revisionIndex}`;
}

function chainRootId(
  draft: DraftRecord,
  byId: Map<string, DraftRecord>
): string {
  let current = draft;
  const seen = new Set<string>();
  while (current.parentDraftId != null) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = byId.get(current.parentDraftId);
    if (!parent) break;
    current = parent;
  }
  return current.id;
}

function membersOfChain(draft: DraftRecord, all: DraftRecord[]): DraftRecord[] {
  const byId = new Map(all.map((row) => [row.id, row]));
  const root = chainRootId(draft, byId);
  return all.filter((row) => chainRootId(row, byId) === root);
}

/**
 * Pending-tip rule (story 3.16): a chain is closed when its head (max
 * revisionIndex) has an outcome; ancestors with NULL outcome are
 * historical. The latest undecided head is always visible, including unavailable
 * evaluation. Eligibility is checked separately; ancestors are never offered.
 */
export function pendingTips(drafts: DraftRecord[]): DraftRecord[] {
  const byId = new Map(drafts.map((row) => [row.id, row]));
  const chains = new Map<string, DraftRecord[]>();
  for (const draft of drafts) {
    const root = chainRootId(draft, byId);
    const list = chains.get(root) ?? [];
    list.push(draft);
    chains.set(root, list);
  }
  const tips: DraftRecord[] = [];
  for (const members of chains.values()) {
    members.sort((a, b) => a.revisionIndex - b.revisionIndex);
    const head = members[members.length - 1];
    if (head == null || head.outcome != null) continue;
    tips.push(head);
  }
  return tips;
}

export function isPendingReadyTip(
  draft: DraftRecord,
  siblings: DraftRecord[]
): boolean {
  return (
    isDraftReady(draft) &&
    pendingTips(siblings).some((tip) => tip.id === draft.id)
  );
}

export function hasInFlightSuccessor(
  draft: DraftRecord,
  siblings: DraftRecord[]
): boolean {
  return membersOfChain(draft, siblings).some(
    (row) => row.revisionIndex > draft.revisionIndex && !isDraftReady(row)
  );
}

export function lineageFromRoot(
  tip: DraftRecord,
  siblings: DraftRecord[]
): DraftRecord[] {
  const byId = new Map(siblings.map((row) => [row.id, row]));
  const chain: DraftRecord[] = [];
  let current: DraftRecord | undefined = tip;
  const seen = new Set<string>();
  while (current != null && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current =
      current.parentDraftId != null
        ? byId.get(current.parentDraftId)
        : undefined;
  }
  chain.reverse();
  return chain;
}

export async function listByRun(db: Db, runId: string): Promise<DraftRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT ${DRAFT_COLUMNS} FROM drafts WHERE run_id = ?
        ORDER BY created_at ASC, id ASC`
    )
    .bind(runId)
    .all<DraftRow>();
  return (results ?? []).map(mapDraft);
}

/**
 * Story 3.10 / 3.16 — the operator queue feed: undecided chain heads,
 * oldest waiting first. Unavailable heads remain visible; historical
 * ancestors never appear here. Decided Drafts never appear here again.
 */
export async function listPending(db: Db): Promise<DraftRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT ${DRAFT_COLUMNS} FROM drafts
        ORDER BY created_at ASC, id ASC`
    )
    .all<DraftRow>();
  const all = (results ?? []).map(mapDraft);
  const tipIds = new Set(pendingTips(all).map((draft) => draft.id));
  return all.filter((draft) => tipIds.has(draft.id));
}

/**
 * Story 3.9 / 3.16 — the public pending-drafts feed: undecided chain heads
 * plus the rejected archive, newest first. Historical NULL-outcome
 * ancestors are not pending. Approved/edited Drafts belong to publish
 * records (3.11) and are deliberately excluded.
 */
export async function listPublicDrafts(db: Db): Promise<DraftRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT ${DRAFT_COLUMNS} FROM drafts
        ORDER BY updated_at DESC, id ASC`
    )
    .all<DraftRow>();
  const all = (results ?? []).map(mapDraft);
  const tipIds = new Set(pendingTips(all).map((draft) => draft.id));
  return all.filter(
    (draft) => tipIds.has(draft.id) || draft.outcome === "rejected"
  );
}

export async function getById(db: Db, id: string): Promise<DraftRecord | null> {
  const row = await db
    .prepare(`SELECT ${DRAFT_COLUMNS} FROM drafts WHERE id = ?`)
    .bind(id)
    .first<DraftRow>();
  return row ? mapDraft(row) : null;
}

export async function insertDraft(
  db: Db,
  input: {
    id: string;
    runId: string;
    targetEntityType: string | null;
    targetEntityId: string | null;
    diff: unknown;
    body: string;
    tier2Only: boolean;
    confidence: number | null;
    evalSummary: EvalSummary | null;
    parentDraftId?: string | null;
    revisionIndex?: number;
    createdAt: string;
  }
): Promise<DraftRecord> {
  const record = DraftRecordSchema.parse({
    id: input.id,
    runId: input.runId,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    diff: input.diff,
    body: input.body,
    tier2Only: input.tier2Only,
    confidence: input.confidence,
    evalSummary: input.evalSummary,
    outcome: null,
    decidedAt: null,
    decidedBy: null,
    editedBody: null,
    rejectReason: null,
    parentDraftId: input.parentDraftId ?? null,
    revisionIndex: input.revisionIndex ?? 0,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  });
  await db
    .prepare(
      `INSERT OR IGNORE INTO drafts (id, run_id, target_entity_type, target_entity_id,
          diff_json, body, tier2_only, confidence, eval_summary_json,
          outcome, decided_at, decided_by, edited_body, parent_draft_id,
          revision_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?)`
    )
    .bind(
      record.id,
      record.runId,
      record.targetEntityType,
      record.targetEntityId,
      JSON.stringify(record.diff),
      record.body,
      record.tier2Only ? 1 : 0,
      record.confidence,
      record.evalSummary == null ? null : JSON.stringify(record.evalSummary),
      record.parentDraftId,
      record.revisionIndex,
      record.createdAt,
      record.updatedAt
    )
    .run();
  return record;
}

const DraftReviewPatchSchema = z
  .object({
    id: z.string().min(1),
    body: z.string().min(1),
    diff: z.unknown(),
    confidence: z.number().int().min(0).max(100).nullable(),
    evalSummary: EvalSummarySchema,
    updatedAt: IsoUtcSchema
  })
  .strict();

type DraftReviewInput = {
  id: string;
  body: string;
  diff: unknown;
  confidence: number | null;
  evalSummary: EvalSummary;
  updatedAt: string;
};

/**
 * Statement form so story 3.5 can `db.batch` this UPDATE with `draft.evaluated`.
 * Validates and loads the row before returning the statement (no write yet).
 */
export async function applyDraftReviewStmt(
  db: Db,
  input: DraftReviewInput
): Promise<D1PreparedStatement> {
  const patch = DraftReviewPatchSchema.parse(input);
  const existing = await getById(db, patch.id);
  if (!existing) {
    throw new Error(`Draft ${patch.id} not found.`);
  }
  const record = DraftRecordSchema.parse({
    ...existing,
    body: patch.body,
    diff: patch.diff,
    confidence: patch.confidence,
    evalSummary: patch.evalSummary,
    updatedAt: patch.updatedAt
  });
  return db
    .prepare(
      `UPDATE drafts
          SET body = ?, diff_json = ?, confidence = ?, eval_summary_json = ?,
              updated_at = ?
        WHERE id = ? AND outcome IS NULL AND eval_summary_json IS NULL`
    )
    .bind(
      record.body,
      JSON.stringify(record.diff),
      record.confidence,
      JSON.stringify(record.evalSummary),
      record.updatedAt,
      record.id
    );
}

const GuardrailIneligiblePatchSchema = z
  .object({
    id: z.string().min(1),
    updatedAt: IsoUtcSchema
  })
  .strict();

/**
 * Statement form so story 3.6 can `db.batch` this UPDATE with
 * `guardrails.failed`. ORs `guardrail_fail` into existing ineligible
 * without clobbering the 3.5 eval payload. Validate-before-write.
 * If the reason is already present, returns a no-op statement.
 */
export async function applyGuardrailIneligibleStmt(
  db: Db,
  input: { id: string; updatedAt: string }
): Promise<D1PreparedStatement> {
  const patch = GuardrailIneligiblePatchSchema.parse(input);
  const stored = await db
    .prepare(`SELECT ${DRAFT_COLUMNS} FROM drafts WHERE id = ?`)
    .bind(patch.id)
    .first<DraftRow>();
  const existing = stored ? mapDraft(stored) : null;
  if (!existing) {
    throw new Error(`Draft ${patch.id} not found.`);
  }
  if (existing.evalSummary == null) {
    throw new Error(`Draft ${patch.id} has no evalSummary to stamp.`);
  }
  if (existing.evalSummary.ineligible.includes("guardrail_fail")) {
    return db.prepare("SELECT 1 WHERE 0");
  }
  const record = DraftRecordSchema.parse({
    ...existing,
    evalSummary: {
      ...existing.evalSummary,
      ineligible: [...existing.evalSummary.ineligible, "guardrail_fail"]
    },
    updatedAt: patch.updatedAt
  });
  return db
    .prepare(
      `UPDATE drafts
          SET eval_summary_json = ?, updated_at = ?
        WHERE id = ? AND outcome IS NULL AND eval_summary_json = ?`
    )
    .bind(
      JSON.stringify(record.evalSummary),
      record.updatedAt,
      record.id,
      stored!.eval_summary_json
    );
}

/**
 * Story 3.5 — persist the drafter overwrite + reviewer eval in one UPDATE.
 * Validate-before-write: merge onto the existing row and parse the full
 * DraftRecord so a CHECK-passing but schema-invalid row cannot land.
 */
export async function applyDraftReview(
  db: Db,
  input: DraftReviewInput
): Promise<DraftRecord> {
  await (await applyDraftReviewStmt(db, input)).run();
  const record = await getById(db, input.id);
  if (!record) {
    throw new Error(`Draft ${input.id} not found.`);
  }
  return record;
}

const DraftDecisionPatchSchema = z
  .object({
    id: z.string().min(1),
    outcome: z.enum(DRAFT_OUTCOME_VALUES),
    decidedAt: IsoUtcSchema,
    decidedBy: z.string().min(1),
    editedBody: z.string().min(1).nullable(),
    rejectReason: z.string().min(1).nullable(),
    rejectReasonPrivate: z.string().min(1).nullable(),
    updatedAt: IsoUtcSchema
  })
  .strict();

export type DraftDecisionPatch = z.infer<typeof DraftDecisionPatchSchema>;

/**
 * Story 3.10 — validate-then-UPDATE decision statement for the Approval Gate.
 * Loads the row, refuses when already decided, merges the decision onto the
 * existing record and parses the full `DraftRecordSchema` before binding, so
 * a CHECK-passing but schema-invalid write cannot land. `rejectReasonPrivate`
 * is bound here but never mapped back out of the repo.
 */
export async function applyDecisionStmt(
  db: Db,
  input: DraftDecisionPatch
): Promise<D1PreparedStatement> {
  const patch = DraftDecisionPatchSchema.parse(input);
  const existing = await getById(db, patch.id);
  if (!existing) {
    throw new Error(`Draft ${patch.id} not found.`);
  }
  if (existing.outcome != null) {
    throw new Error(`Draft ${patch.id} already decided.`);
  }
  const record = DraftRecordSchema.parse({
    ...existing,
    outcome: patch.outcome,
    decidedAt: patch.decidedAt,
    decidedBy: patch.decidedBy,
    editedBody: patch.editedBody,
    rejectReason: patch.rejectReason,
    updatedAt: patch.updatedAt
  });
  return db
    .prepare(
      `UPDATE drafts
          SET outcome = ?, decided_at = ?, decided_by = ?, edited_body = ?,
              reject_reason = ?, reject_reason_private = ?, updated_at = ?
        WHERE id = ? AND outcome IS NULL`
    )
    .bind(
      record.outcome,
      record.decidedAt,
      record.decidedBy,
      record.editedBody,
      record.rejectReason,
      patch.rejectReasonPrivate,
      record.updatedAt,
      record.id
    );
}

/** Mirrors pendingTips: highest revision, breaking ties by listByRun order. */
export function currentHeadSql(alias: string): string {
  return `NOT EXISTS (
    WITH RECURSIVE chain(id, root, revision_index, created_at) AS (
      SELECT id, id, revision_index, created_at FROM drafts WHERE run_id = ${alias}.run_id AND parent_draft_id IS NULL
      UNION ALL
      SELECT d.id, c.root, d.revision_index, d.created_at FROM drafts d JOIN chain c ON d.parent_draft_id = c.id
      WHERE d.run_id = ${alias}.run_id
    )
    SELECT 1 FROM chain current JOIN chain newer ON newer.root = current.root
    WHERE current.id = ${alias}.id AND
      (newer.revision_index, newer.created_at, newer.id) > (current.revision_index, current.created_at, current.id)
  )`;
}

/** Shared commit-time boundary for decisions and revision admission. */
export const READY_HEAD_SQL = `drafts.outcome IS NULL
  AND ${currentHeadSql("drafts")}
  AND EXISTS (SELECT 1 FROM runs WHERE id = drafts.run_id AND status != 'running')
  AND drafts.eval_summary_json IS NOT NULL
  AND (json_extract(drafts.eval_summary_json, '$.status') != 'evals_not_run'
    OR length(trim(json_extract(drafts.eval_summary_json, '$.basis'), char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))) > 0)
  AND EXISTS (SELECT 1 FROM evidence_events e WHERE e.run_id = drafts.run_id
    AND e.event = 'draft.evaluated' AND json_extract(e.payload_json, '$.draftId') = drafts.id)
  AND EXISTS (SELECT 1 FROM evidence_events e WHERE e.run_id = drafts.run_id
    AND e.event IN ('guardrails.passed','guardrails.failed') AND json_extract(e.payload_json, '$.draftId') = drafts.id)
  AND (drafts.revision_index = 0 OR EXISTS (SELECT 1 FROM evidence_events e WHERE e.run_id = drafts.run_id
    AND e.event = 'draft.revised' AND json_extract(e.payload_json, '$.draftId') = drafts.id))`;

export function readySnapshotStmt(
  db: Db,
  draft: DraftRecord
): D1PreparedStatement {
  const snapshot = storedSnapshots.get(draft);
  if (!snapshot) throw new Error("A persisted Draft snapshot is required");
  return assertStmt(
    db,
    "draft_snapshot",
    `EXISTS (SELECT 1 FROM drafts WHERE id = ? AND ${READY_HEAD_SQL}
    AND run_id IS ? AND target_entity_type IS ? AND target_entity_id IS ?
    AND diff_json IS ? AND body IS ? AND tier2_only IS ? AND confidence IS ?
    AND eval_summary_json IS ? AND edited_body IS ?
    AND parent_draft_id IS ? AND revision_index IS ? AND updated_at IS ?)`,
    [
      draft.id,
      draft.runId,
      draft.targetEntityType,
      draft.targetEntityId,
      snapshot.diff,
      draft.body,
      draft.tier2Only ? 1 : 0,
      draft.confidence,
      snapshot.evaluation,
      draft.editedBody,
      draft.parentDraftId,
      draft.revisionIndex,
      draft.updatedAt
    ]
  );
}

/** Only the caller whose conditional INSERT changes a row owns evaluation. */
export async function insertRevision(
  db: Db,
  parent: DraftRecord,
  createdAt: string
): Promise<boolean> {
  const result = await db
    .prepare(`INSERT OR IGNORE INTO drafts
    (id, run_id, target_entity_type, target_entity_id, diff_json, body, tier2_only,
      confidence, eval_summary_json, parent_draft_id, revision_index, created_at, updated_at)
    SELECT ?, run_id, target_entity_type, target_entity_id, diff_json, body, tier2_only,
      NULL, NULL, id, revision_index + 1, ?, ? FROM drafts
    WHERE id = ? AND ${READY_HEAD_SQL}
      AND EXISTS (SELECT 1 FROM runs WHERE id = drafts.run_id AND status = 'awaiting')`)
    .bind(
      revisionDraftId(parent.id, parent.revisionIndex + 1),
      createdAt,
      createdAt,
      parent.id
    )
    .run();
  return result.meta.changes === 1;
}
