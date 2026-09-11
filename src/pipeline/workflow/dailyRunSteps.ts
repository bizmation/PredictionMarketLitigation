import type { Db } from "../../shared/db/client";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import { append } from "../projector/evidence";
import type { RunOrigin } from "../../shared/schemas/vocabulary";
import { draftAndReview } from "../agents/draftAndReview";
import { enforceDraftGuardrails } from "../ai/actionPolicy";
import type { GatewayDeps } from "../ai/gateway";
import {
  evidenceId,
  runConnector,
  stubCheck,
  type SourceCheck
} from "../connectors/connector";
import { POLL_SOURCES } from "../connectors/sources";

export function runIdFor(scheduledFor: string, origin: RunOrigin): string {
  const suffix: Record<RunOrigin, string> = {
    scheduled: "0000",
    "catch-up": "0001",
    manual: "0002"
  };
  return `run-${scheduledFor.replace(/-/g, "")}-${suffix[origin]}`;
}

export async function ensureRun(
  db: Db,
  origin: RunOrigin,
  scheduledFor: string
): Promise<void> {
  const existing = await runsRepo.findRunForDate(db, scheduledFor, origin);
  const now = new Date().toISOString();
  const id = existing?.id ?? runIdFor(scheduledFor, origin);
  if (!existing) {
    try {
      await runsRepo.insertRun(db, {
        id,
        origin,
        mode: "hitl",
        status: "running",
        startedAt: now,
        completedAt: null,
        spendCents: 0,
        spendCurrency: "USD",
        budgetCents: null,
        scheduledFor
      });
    } catch {
      // Same-id retry/race: the row is already there; still backfill evidence.
    }
  }
  await append(db, {
    id: evidenceId(id, "run.started"),
    runId: id,
    event: "run.started",
    payload: { origin, scheduledFor },
    createdAt: now
  });
}

export async function finishEmpty(db: Db, runId: string): Promise<void> {
  const now = new Date().toISOString();
  await runsRepo.completeRun(db, runId, "empty", now);
  await append(db, {
    id: evidenceId(runId, "run.empty"),
    runId,
    event: "run.empty",
    payload: { drafts: 0 },
    createdAt: now
  });
}

export async function finishAwaiting(
  db: Db,
  runId: string,
  draftCount: number
): Promise<void> {
  const now = new Date().toISOString();
  await runsRepo.completeRun(db, runId, "awaiting", now);
  await append(db, {
    id: evidenceId(runId, "gate.awaiting_approval"),
    runId,
    event: "gate.awaiting_approval",
    payload: { drafts: draftCount },
    createdAt: now
  });
}

export async function finishFailed(db: Db, runId: string): Promise<void> {
  const now = new Date().toISOString();
  await runsRepo.completeRun(db, runId, "failed", now);
  await append(db, {
    id: evidenceId(runId, "run.failed"),
    runId,
    event: "run.failed",
    payload: { reason: "error" },
    createdAt: now
  });
}

/**
 * Close a daily step. Drafts always take the gate path (`awaiting`) — a
 * sibling connector error is recorded as `run.failed` evidence by the
 * connector and must not mark the Run `empty` or strand drafts on `failed`.
 * Zero drafts + a connector/step error → `failed`.
 */
export async function completeDailyStep(
  db: Db,
  runId: string,
  result: { draftCount: number; anyFailure: boolean }
): Promise<void> {
  if (result.draftCount > 0) {
    await finishAwaiting(db, runId, result.draftCount);
    return;
  }
  if (result.anyFailure) {
    await finishFailed(db, runId);
    return;
  }
  await finishEmpty(db, runId);
}

export async function monitorAndPackage(
  db: Db,
  runId: string,
  checks: Record<string, SourceCheck> = {}
): Promise<{ draftCount: number; anyFailure: boolean }> {
  let draftCount = 0;
  let anyFailure = false;
  for (const source of POLL_SOURCES) {
    const check = checks[source.name] ?? stubCheck;
    const result = await runConnector(db, runId, source, check);
    draftCount += result.draftCount;
    if (result.failed) anyFailure = true;
  }
  return { draftCount, anyFailure };
}

/**
 * Post-packaging control flow: empty Runs complete with no LLM and no
 * guardrail events. Material Runs run draft-and-review, then
 * `enforceDraftGuardrails` before `completeDailyStep` only if the Run is
 * still `running` (budget-stop already marked `stopped`).
 */
export async function afterPackaging(
  db: Db,
  runId: string,
  result: { draftCount: number; anyFailure: boolean },
  gatewayDeps: GatewayDeps
): Promise<void> {
  if (result.draftCount === 0) {
    await completeDailyStep(db, runId, result);
    return;
  }
  await draftAndReview(db, runId, gatewayDeps);
  await enforceDraftGuardrails(db, runId, gatewayDeps);
  const run = await runsRepo.getRunById(db, runId);
  if (!run || run.status !== "running") return;
  await completeDailyStep(db, runId, result);
}

export type DailyPackageResult =
  | { skip: true }
  | {
      skip: false;
      runId: string;
      draftCount: number;
      anyFailure: boolean;
    };

/**
 * Body of Workflow `run-daily-step`. Empty packaging completes here (no LLM
 * step). Material packaging leaves the Run `running` for `reviewDailyRun`.
 */
export async function packageDailyRun(
  db: Db,
  origin: RunOrigin,
  scheduledFor: string,
  gatewayDeps: GatewayDeps,
  checks: Record<string, SourceCheck> = {}
): Promise<DailyPackageResult> {
  const run = await runsRepo.findRunForDate(db, scheduledFor, origin);
  if (!run || run.status !== "running") {
    return { skip: true };
  }
  try {
    const result = await monitorAndPackage(db, run.id, checks);
    if (result.draftCount === 0) {
      await afterPackaging(db, run.id, result, gatewayDeps);
    }
    return {
      skip: false,
      runId: run.id,
      draftCount: result.draftCount,
      anyFailure: result.anyFailure
    };
  } catch {
    await finishFailed(db, run.id);
    return { skip: true };
  }
}

/**
 * Body of Workflow `draft-and-review`. No-ops when packaging skipped or
 * produced zero drafts, so empty Runs never enter the LLM step.
 */
export async function reviewDailyRun(
  db: Db,
  packaged: DailyPackageResult,
  gatewayDeps: GatewayDeps
): Promise<void> {
  if (packaged.skip || packaged.draftCount === 0) return;
  try {
    await afterPackaging(
      db,
      packaged.runId,
      {
        draftCount: packaged.draftCount,
        anyFailure: packaged.anyFailure
      },
      gatewayDeps
    );
  } catch {
    await finishFailed(db, packaged.runId);
  }
}
