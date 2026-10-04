import type { Db } from "../client";
import { assertStmt } from "./gateAssertions";
import * as runsRepo from "./runsRepo";
import * as packages from "./runPackagesRepo";
import * as config from "./pipelineConfigRepo";
import { appendStmt } from "../../../pipeline/projector/evidence";

export type Admission = {
  run_id: string;
  scheduled_for: string;
  request_id: string;
  instance_id: string;
  state:
    | "pending"
    | "submitting"
    | "confirmed"
    | "uncertain"
    | "unavailable"
    | "resolved";
  instance_status: string | null;
  entered: number;
  finished: number;
  released: number;
};
export const fenceSql = (alias: string) =>
  `NOT EXISTS(SELECT 1 FROM run_retirements t WHERE t.run_id=${alias}.id) AND NOT EXISTS(SELECT 1 FROM run_admissions f WHERE f.run_id=${alias}.id AND f.released=1) AND NOT EXISTS(SELECT 1 FROM run_admissions f WHERE f.scheduled_for=${alias}.scheduled_for AND f.released=0 AND f.run_id<>${alias}.id)`;
const settled = (id: string) =>
  `NOT EXISTS(SELECT 1 FROM llm_operations o WHERE o.run_id=${id} AND (o.state IN ('reserved','dispatched','uncertain') OR o.issue IS NOT NULL)) AND NOT EXISTS(SELECT 1 FROM llm_run_accounting a WHERE a.run_id=${id} AND (a.issue_count>0 OR a.reserved_cents>0 OR a.uncertain_cents>0))`;
export async function get(db: Db, runId: string) {
  return db
    .prepare("SELECT * FROM run_admissions WHERE run_id=?")
    .bind(runId)
    .first<Admission>();
}
export async function byRequest(db: Db, requestId: string) {
  return db
    .prepare("SELECT * FROM run_admissions WHERE request_id=?")
    .bind(requestId)
    .first<Admission>();
}
export async function active(db: Db, date: string) {
  return db
    .prepare(
      "SELECT * FROM run_admissions WHERE scheduled_for=? AND released=0"
    )
    .bind(date)
    .first<Admission>();
}
export async function admit(
  db: Db,
  run: Parameters<typeof runsRepo.insertRunStmt>[1],
  requestId: string,
  supersede: boolean,
  priorRunId?: string,
  legacyInstanceId?: string
) {
  const snapshot = await config.getEffectivePollSources(db);
  const legacy = legacyInstanceId !== undefined;
  const instanceId = legacyInstanceId ?? `daily-${run.id}`;
  await db.batch([
    db
      .prepare(
        `UPDATE run_admissions SET released=1 WHERE scheduled_for=? AND released=0 AND finished=1 AND EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.status NOT IN ('running','awaiting')) AND ${settled("run_admissions.run_id")}`
      )
      .bind(run.scheduledFor),
    assertStmt(
      db,
      "date_admission",
      `NOT EXISTS(SELECT 1 FROM runs r WHERE r.scheduled_for=? AND (r.status IN ('running','awaiting') OR NOT (${settled("r.id")})))`,
      [run.scheduledFor]
    ),
    db
      .prepare(
        `INSERT OR IGNORE INTO run_retirements(run_id) SELECT r.id FROM runs r WHERE r.scheduled_for=? AND NOT EXISTS(SELECT 1 FROM run_admissions a WHERE a.run_id=r.id)`
      )
      .bind(run.scheduledFor),
    assertStmt(
      db,
      "supersede_confirmation",
      `?=1 OR NOT EXISTS(SELECT 1 FROM runs WHERE scheduled_for=? AND status='published')`,
      [Number(supersede), run.scheduledFor]
    ),
    assertStmt(
      db,
      "supersede_predecessor",
      `COALESCE((SELECT id FROM runs WHERE scheduled_for=? AND status='published' ORDER BY started_at DESC,id DESC LIMIT 1),'') = ?`,
      [run.scheduledFor, priorRunId ?? ""]
    ),
    runsRepo.insertRunStmt(db, run),
    packages.snapshotStmt(db, run.id, snapshot),
    db
      .prepare(
        "INSERT INTO run_admissions(run_id,scheduled_for,request_id,instance_id,state) VALUES(?,?,?,?,?)"
      )
      .bind(
        run.id,
        run.scheduledFor,
        requestId,
        instanceId,
        legacy ? "uncertain" : "pending"
      ),
    ...(priorRunId
      ? [
          appendStmt(db, {
            id: `${run.id}:run.superseded`,
            runId: run.id,
            event: "run.superseded",
            payload: { priorRunId },
            createdAt: run.startedAt
          })
        ]
      : []),
    appendStmt(db, {
      id: `${run.id}-admission`,
      runId: run.id,
      event: "run.dispatch",
      payload: {
        admission: legacy ? "legacy_attached" : "pending",
        instanceId
      },
      createdAt: run.startedAt
    })
  ]);
  return (await get(db, run.id))!;
}
export async function record(
  db: Db,
  runId: string,
  state: Admission["state"],
  status: string | null = null
) {
  await db.batch([
    assertStmt(
      db,
      "dispatch_receipt_owner",
      "EXISTS(SELECT 1 FROM run_admissions WHERE run_id=? AND released=0)",
      [runId]
    ),
    db
      .prepare(
        "UPDATE run_admissions SET state=?,instance_status=?,finished=CASE WHEN ? IN ('complete','errored','terminated') THEN 1 ELSE finished END WHERE run_id=? AND released=0 AND (? <> 'unavailable' OR state='pending') AND (? <> 'uncertain' OR state <> 'confirmed') AND (instance_status IS NULL OR instance_status NOT IN ('complete','errored','terminated'))"
      )
      .bind(state, status, status, runId, state, state),
    appendStmt(
      db,
      {
        id: `${runId}-dispatch-${crypto.randomUUID()}`,
        runId,
        event: "run.dispatch",
        payload: { dispatch: state, instanceStatus: status },
        createdAt: new Date().toISOString()
      },
      { previousChange: true }
    )
  ]);
}
export async function claimSubmission(db: Db, runId: string) {
  const result = await db.batch([
    db
      .prepare(
        "UPDATE run_admissions SET state='submitting' WHERE run_id=? AND released=0 AND state IN ('pending','unavailable')"
      )
      .bind(runId),
    appendStmt(
      db,
      {
        id: `${runId}-submission-${crypto.randomUUID()}`,
        runId,
        event: "run.dispatch",
        payload: { dispatch: "submitting" },
        createdAt: new Date().toISOString()
      },
      { previousChange: true }
    )
  ]);
  return result[0]!.meta.changes > 0;
}
/** Compose with a write so ownership cannot transfer between check and mutation. */
export function assertOwnedStmt(db: Db, runId: string) {
  return assertStmt(
    db,
    "run_admission_fence",
    `EXISTS(SELECT 1 FROM runs r WHERE id=? AND ${fenceSql("r")})`,
    [runId]
  );
}

export async function assertOwned(db: Db, runId: string) {
  const row = await db
    .prepare(`SELECT 1 AS ok FROM runs r WHERE id=? AND ${fenceSql("r")}`)
    .bind(runId)
    .first();
  if (!row) throw new Error("run_admission_fenced");
}
export async function enter(db: Db, runId: string) {
  await db.batch([
    assertStmt(
      db,
      "workflow_admission_fence",
      `EXISTS(SELECT 1 FROM runs r JOIN run_admissions a ON a.run_id=r.id WHERE r.id=? AND ${fenceSql("r")})`,
      [runId]
    ),
    db
      .prepare("UPDATE run_admissions SET entered=1,finished=0 WHERE run_id=?")
      .bind(runId)
  ]);
}
export async function finish(db: Db, runId: string) {
  await db
    .prepare(
      "UPDATE run_admissions SET finished=1 WHERE run_id=? AND released=0"
    )
    .bind(runId)
    .run();
}
/** Fencing a never-entered uncertain submission is safe even if create later arrives. */
export async function resolve(db: Db, runId: string) {
  if ((await get(db, runId))?.state === "resolved") return;
  await db.batch([
    assertStmt(
      db,
      "dispatch_resolution_safe",
      `EXISTS(SELECT 1 FROM run_admissions WHERE run_id=? AND ((released=1 AND state='resolved') OR (released=0 AND (entered=0 OR finished=1) AND EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.status<>'awaiting') AND ${settled("run_admissions.run_id")})))`,
      [runId]
    ),
    db
      .prepare(
        "UPDATE run_admissions SET released=1,state='resolved' WHERE run_id=? AND released=0"
      )
      .bind(runId),
    db
      .prepare(
        "UPDATE runs SET status='failed',completed_at=? WHERE id=? AND status='running'"
      )
      .bind(new Date().toISOString(), runId),
    appendStmt(db, {
      id: `${runId}-dispatch-resolution`,
      runId,
      event: "run.dispatch",
      payload: { reason: "dispatch_fenced_resolution" },
      createdAt: new Date().toISOString()
    })
  ]);
}

const canResolveSql = `released=0 AND (entered=0 OR finished=1) AND EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.status<>'awaiting') AND ${settled("run_admissions.run_id")}`;
type Inspection = Admission & { can_resolve: number };
/** One snapshot for both ownership and resolution eligibility. */
export async function inspect(db: Db, runId: string) {
  const row = await db
    .prepare(
      `SELECT *, (${canResolveSql}) AS can_resolve FROM run_admissions WHERE run_id=?`
    )
    .bind(runId)
    .first<Inspection>();
  return row ? project(row, !!row.can_resolve) : null;
}
export function project(claim: Admission, canResolve = false) {
  return {
    runId: claim.run_id,
    instanceId: claim.instance_id,
    state: claim.state,
    instanceStatus: claim.instance_status,
    ownsDate: !claim.released,
    canResolve
  };
}
export async function listActive(db: Db) {
  const rows = await db
    .prepare(
      `SELECT *, (${canResolveSql}) AS can_resolve FROM run_admissions WHERE released=0 AND NOT (finished=1 AND EXISTS(SELECT 1 FROM runs r WHERE r.id=run_id AND r.status NOT IN ('running','awaiting')) AND ${settled("run_admissions.run_id")}) ORDER BY scheduled_for DESC`
    )
    .all<Inspection>();
  return rows.results.map((row) => project(row, !!row.can_resolve));
}

/** Legacy instances acquire the same date lock before any recoverable work. */
export const legacyRequestId = (runId: string) => `internal:legacy:${runId}`;
export function historicalInstanceId(run: {
  id: string;
  origin: string;
  scheduledFor: string | null;
}) {
  return run.origin === "scheduled"
    ? `daily-${run.scheduledFor}`
    : `${run.origin}-${run.scheduledFor}-${run.id.slice(-4)}`;
}
export async function attachLegacy(
  db: Db,
  runId: string,
  actualInstanceId?: string
) {
  const run = await runsRepo.getRunById(db, runId);
  if (!run) throw new Error("attached_run_missing");
  const existing = await get(db, runId);
  const instanceId =
    actualInstanceId ?? existing?.instance_id ?? historicalInstanceId(run);
  await db.batch([
    assertStmt(
      db,
      "legacy_admission_fence",
      `EXISTS(SELECT 1 FROM runs r WHERE r.id=? AND ${fenceSql("r")} AND NOT EXISTS(SELECT 1 FROM runs other WHERE other.scheduled_for=r.scheduled_for AND other.id<>r.id AND (other.status IN ('running','awaiting') OR NOT (${settled("other.id")}))))`,
      [runId]
    ),
    db
      .prepare(
        `INSERT OR IGNORE INTO run_admissions(run_id,scheduled_for,request_id,instance_id,state) SELECT id,scheduled_for,?,?,'uncertain' FROM runs WHERE id=?`
      )
      .bind(legacyRequestId(runId), instanceId, runId),
    assertStmt(
      db,
      "legacy_instance_identity",
      "EXISTS(SELECT 1 FROM run_admissions WHERE run_id=? AND request_id=? AND instance_id IN (?,?))",
      [runId, legacyRequestId(runId), instanceId, historicalInstanceId(run)]
    ),
    db
      .prepare(
        "UPDATE run_admissions SET instance_id=? WHERE run_id=? AND request_id=?"
      )
      .bind(instanceId, runId, legacyRequestId(runId))
  ]);
}
