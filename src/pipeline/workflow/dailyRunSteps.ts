import type { Db } from "../../shared/db/client";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { RunOrigin } from "../../shared/schemas/vocabulary";
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
  await evidenceRepo.appendEvent(db, {
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
  await evidenceRepo.appendEvent(db, {
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
  await evidenceRepo.appendEvent(db, {
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
  await evidenceRepo.appendEvent(db, {
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
