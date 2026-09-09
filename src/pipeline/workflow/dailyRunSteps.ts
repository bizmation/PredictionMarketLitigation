import type { Db } from "../../shared/db/client";
import * as evidenceRepo from "../../shared/db/repos/evidenceRepo";
import * as runsRepo from "../../shared/db/repos/runsRepo";
import type { RunOrigin } from "../../shared/schemas/vocabulary";

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
