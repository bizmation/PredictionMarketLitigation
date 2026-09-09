import type { Db } from "../../shared/db/client";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { RunOrigin } from "../../shared/schemas/vocabulary";
import {
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
  if (existing) return;
  const now = new Date().toISOString();
  const id = runIdFor(scheduledFor, origin);
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
  await evidenceRepo.appendEvent(db, {
    id: crypto.randomUUID(),
    runId: id,
    event: "run.started",
    payload: { origin, scheduledFor },
    createdAt: now
  });
}

export async function finishEmpty(db: Db, runId: string): Promise<void> {
  const now = new Date().toISOString();
  const changed = await runsRepo.completeRun(db, runId, "empty", now);
  if (!changed) return;
  await evidenceRepo.appendEvent(db, {
    id: crypto.randomUUID(),
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
  const changed = await runsRepo.completeRun(db, runId, "awaiting", now);
  if (!changed) return;
  await evidenceRepo.appendEvent(db, {
    id: crypto.randomUUID(),
    runId,
    event: "gate.awaiting_approval",
    payload: { drafts: draftCount },
    createdAt: now
  });
}

export async function finishFailed(db: Db, runId: string): Promise<void> {
  await runsRepo.completeRun(db, runId, "failed", new Date().toISOString());
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
